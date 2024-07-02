import { CognitoUserPoolsAuthorizer, Cors, LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from "constructs";
import { OceanicUsers } from "./users";
import { lambdaDefaults } from "../oceanic-cloud-stack";
import path = require("path");
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { OceanicStorage } from "./storage";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { parse } from "yaml";
import { openSync, readFileSync } from "fs";
import { AllowedMethods, CachePolicy, Distribution, KeyGroup, OriginRequestPolicy, PublicKey, ResponseHeadersPolicy } from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, RestApiOrigin, S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Stack } from "aws-cdk-lib";

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
    private distribution: Distribution;

    constructor (scope: Construct, id: string, props: OceanicApiProps) {
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
        
        const functions: { [key: string]: NodejsFunction } = {};
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

                // create the lambda function
                let lambdaFunction: NodejsFunction;
                if (!functions[name]) {
                    lambdaFunction = new NodejsFunction(this, name, {
                        runtime: lambdaDefaults.runtime,
                        architecture: lambdaDefaults.architecture,
                        entry: entry
                    });
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