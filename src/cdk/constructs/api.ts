import {CognitoUserPoolsAuthorizer, Cors, LambdaIntegration, RestApi} from "aws-cdk-lib/aws-apigateway";
import {Certificate} from 'aws-cdk-lib/aws-certificatemanager';
import {Construct} from "constructs";
import {OceanicUsers} from "./users";
import {lambdaDefaults} from "../oceanic-cloud-stack";
import path = require("path");
import {OceanicStorage} from "./storage";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Effect, Policy, PolicyDocument, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {parse} from "yaml";
import {readFileSync} from "fs";
import {AllowedMethods, CachePolicy, Distribution, KeyGroup, OriginRequestPolicy, PublicKey, ResponseHeadersPolicy} from "aws-cdk-lib/aws-cloudfront";
import {HttpOrigin, RestApiOrigin, S3Origin} from "aws-cdk-lib/aws-cloudfront-origins";
import {Stack} from "aws-cdk-lib";

interface OceanicApiProps {
    isProd: boolean;
    cognito: OceanicUsers;
    storage: OceanicStorage;
    domainName?: string;
    certArn?: string;
}

export class OceanicApi extends Construct {
    api: RestApi;
    apiVersion: string;
    private storage: OceanicStorage;
    private cognito: OceanicUsers
    private keyGroup: KeyGroup;
    private cloudfrontPrivateKey: string;
    private distribution: Distribution;
    private readonly lambdaPolicies: {[key: string]: Policy};

    constructor(scope: Construct, id: string, props: OceanicApiProps) {
        super(scope, id)
        // API definition
        this.apiVersion = "0.1.0";
        this.api = new RestApi(this, "rest-api", {
            retainDeployments: props.isProd,
            restApiName: `Oceanic ${props.isProd ? "Prod" : "Test"}`,
            deployOptions: {
                stageName: "v1"
            },
            domainName: (props?.domainName && props.certArn) ? {
                domainName: props.domainName,
                certificate: Certificate.fromCertificateArn(this, "cert-arn", props.certArn)
            } : undefined
        });

        this.storage = props.storage;
        this.cognito = props.cognito;
        this.keyGroup = new KeyGroup(this, "url-key-group", {
            items: [
                new PublicKey(this, "pubkey", {
                    encodedKey: readFileSync("public_key.pem").toString()
                })
            ]
        });
        this.cloudfrontPrivateKey = readFileSync("private_key.pem").toString();

        // define lambda policies
        this.lambdaPolicies = {
            documentMetadataRead: new Policy(this, "document-metadata-read-policy", {
                document: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["dynamodb:GetItem", "dynamodb:Query"],
                            conditions: {
                                "StringLike": {
                                    "dynamodb:LeadingKeys": "documents:*"
                                }
                            },
                            resources: [this.storage.table.tableArn]
                        })
                    ]
                })
            }),
            documentMetadataWrite: new Policy(this, "document-metadata-write-policy", {
                document: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["dynamodb:PutItem", "dynamodb:UpdateItem"],
                            conditions: {
                                "StringLike": {
                                    "dynamodb:LeadingKeys": "documents:*"
                                }
                            },
                            resources: [this.storage.table.tableArn],
                        })
                    ]
                })
            })
        };

        this.loadApiDefinition("src/api/definition.yml", "src/api/endpoints");

        this.distribution = new Distribution(this, "distribution", {
            defaultBehavior: {
                origin: new RestApiOrigin(this.api),
                allowedMethods: AllowedMethods.ALLOW_ALL,
                cachePolicy: CachePolicy.CACHING_DISABLED,
            },
            additionalBehaviors: {
                "/auth": {
                    origin: new HttpOrigin(`cognito-idp.${Stack.of(this).region}.amazonaws.com`),
                    cachePolicy: CachePolicy.CACHING_DISABLED,
                    allowedMethods: AllowedMethods.ALLOW_ALL,
                    originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
                    responseHeadersPolicy: ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS
                },
                "/storage/*": {
                    origin: new S3Origin(this.storage.bucket, {
                        originAccessIdentity: this.storage.originAccessIdentity
                    }),
                    trustedKeyGroups: [
                        this.keyGroup
                    ]
                }
            }
        });
    }

    /**
     * Create an API from a custom OpenAPI file. To be clear, this is *not* the same as defining an API gateway with a file. This is fully custom, with the reason for using OpenAPI being easier documentation and better code organization.
     * @param baseApi The api to create endpoints on
     * @param templatePath The path of the OpenAPI template file
     * @param baseFunctionPath The base path for lambda function entrypoints in x-lambda-entry
     */
    loadApiDefinition(templatePath: string, baseFunctionPath: string) {
        // load and parse template file
        const templateContent = readFileSync(templatePath).toString();
        const template = parse(templateContent);

        const functions: {[key: string]: NodejsFunction} = {};
        // iterate through each defined path (unless it's explicitly exluded)
        for (const resourcePath in template.paths) {
            const resourceDefinition = template.paths[resourcePath];

            if (resourceDefinition["x-generation-exclude"]) {
                // don't add this path at all
                continue;
            }

            // climb the rest api resource tree
            const pathParts = resourcePath.split("/")
            for (let i = 0; i < pathParts.length; i++) {
                if (pathParts[i] === "") {
                    pathParts.splice(i, 1);
                }
            }
            console.log(pathParts);
            let resource = this.api.root;
            for (const part of pathParts) {
                // create a new resource if it doesn't already exist
                const next = resource.getResource(part);
                if (!next) {
                    resource = resource.addResource(part);
                }
                else {
                    resource = next;
                }
            }

            // load functions for each method under the path
            for (const method in resourceDefinition) {
                // extract the node entry point for the lambda function
                const entry = path.join(baseFunctionPath, resourceDefinition[method]["x-lambda-entry"]);
                // generate a name for the function
                const name = (resourceDefinition[method]["x-lambda-entry"] as string).replace("/", "-").replace(/.(js|ts)$/, "") + "-function";
                console.log(name);
                // fetch the required permissions
                const dependencies: string[] = resourceDefinition[method]["x-lambda-dependencies"] ? resourceDefinition[method]["x-lambda-dependencies"] : [];
                console.log(dependencies);

                // create the lambda function
                let lambdaFunction: NodejsFunction;
                if (!functions[name]) {
                    // set up environment variables
                    const environment: any = {};
                    if (dependencies.find(a => a === "cloudfront-signing-key")) {
                        environment["CLOUDFRONT_PRIVATE_KEY"] = this.cloudfrontPrivateKey;
                    }
                    lambdaFunction = new NodejsFunction(this, name, {
                        runtime: lambdaDefaults.runtime,
                        architecture: lambdaDefaults.architecture,
                        entry: entry,
                        environment,
                        memorySize: 256,
                    });
                    // apply iam policies
                    if (!lambdaFunction.role) {
                        // this should never happen
                        throw new Error("the function doesn't have a role.... why");
                    }
                    for (const dependency of dependencies) {
                        switch (dependency) {
                            case "document-metadata-read-policy":
                                this.lambdaPolicies.documentMetadataRead.attachToRole(lambdaFunction.role);
                                break;
                            case "document-metadata-write-policy":
                                this.lambdaPolicies.documentMetadataWrite.attachToRole(lambdaFunction.role);
                                break;
                        }
                    }
                    functions[name] = lambdaFunction;
                } else {
                    lambdaFunction = functions[name];
                }

                // add the lambda function to the rest api
                const integration = new LambdaIntegration(lambdaFunction);
                resource.addMethod(method, integration);
            }
        }
    }
}
