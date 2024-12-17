import {CognitoUserPoolsAuthorizer, IRestApi, InlineApiDefinition, LambdaIntegration, RestApi, SpecRestApi, TokenAuthorizer} from "aws-cdk-lib/aws-apigateway";
import {Construct} from "constructs";
import {OceanicUsers} from "./users";
import {lambdaDefaults} from "../oceanic-cloud-stack";
import path = require("path");
import {OceanicStorage} from "./storage";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Effect, Policy, PolicyDocument, PolicyStatement, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {readFileSync, writeFileSync} from "fs";
import {AllowedMethods, CachePolicy, Distribution, KeyGroup, OriginRequestPolicy, PublicKey, ResponseHeadersPolicy} from "aws-cdk-lib/aws-cloudfront";
import {HttpOrigin, RestApiOrigin, S3Origin} from "aws-cdk-lib/aws-cloudfront-origins";
import {Arn, ArnFormat, CfnOutput, Names, Stack} from "aws-cdk-lib";
import {iamUUIDWildcard} from "../utils/constants";

interface OceanicApiProps {
    isProd: boolean;
    cognito: OceanicUsers;
    storage: OceanicStorage;
    domainName?: string;
    certArn?: string;
}

export class OceanicApi extends Construct {
    api: SpecRestApi;
    apiVersion: string;
    private storage: OceanicStorage;
    private cognito: OceanicUsers;
    private cognitoAuthorizer: CognitoUserPoolsAuthorizer;
    private keyGroup: KeyGroup;
    private cloudfrontPrivateKey: string;
    private distribution: Distribution;
    private readonly lambdaPolicies: {[key: string]: Policy};

    constructor(scope: Construct, id: string, props: OceanicApiProps) {
        super(scope, id)
        // API definition
        this.apiVersion = "0.1.0";
        this.storage = props.storage;
        this.cognito = props.cognito;

        // define lambda policies
        this.lambdaPolicies = {
            documentMetadataRead: new Policy(this, "document-metadata-read-policy", {
                document: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["dynamodb:GetItem", "dynamodb:Query"],
                            conditions: {
                                "ForAllValues:StringLike": {
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
                                "ForAllValues:StringLike": {
                                    "dynamodb:LeadingKeys": "documents:*"
                                }
                            },
                            resources: [this.storage.table.tableArn],
                        })
                    ]
                })
            }),
            documentReadWrite: new Policy(this, "document-read-write", {
                document: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["s3:GetObject", "s3:PutObject"],
                            resources: [
                                `${this.storage.bucket.bucketArn}/${iamUUIDWildcard}/documents/${iamUUIDWildcard}/content`, // {userId}/documents/{documentId}
                                `${this.storage.bucket.bucketArn}/${iamUUIDWildcard}/documents/${iamUUIDWildcard}/attachments/${iamUUIDWildcard}`
                            ],
                        }),
                    ],
                }),
            }),
        };

        const loadedApi = this.loadApiDefinition("src/api/definition.bundle.json", "src/api/endpoints");
        this.api = new SpecRestApi(this, "rest-api", {
            apiDefinition: loadedApi.definition,
            deploy: true,
            description: "I hope this works",
        });
        for (const func of loadedApi.permissionFuncs) {
            func(this.api);
        }

        this.distribution = new Distribution(this, "distribution", {
            defaultBehavior: {
                origin: new RestApiOrigin(this.api),
                allowedMethods: AllowedMethods.ALLOW_ALL,
                cachePolicy: CachePolicy.CACHING_DISABLED,
                originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER, // for some reason ALL_VIEWER deosn't work with API Gateway...
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
                }
            }
        });
        new CfnOutput(this, "distribution-url", {value: `https://${this.distribution.distributionDomainName}`});
    }

    /**
     * Modify the API definition to work with API gateway
     * @param templatePath where the OpenAPI template file is
     * @param baseFunctionPath where lambda functions are located
     **/
    loadApiDefinition(templatePath: string, baseFunctionPath: string) {
        const templateFile = readFileSync(templatePath).toString();
        const template = JSON.parse(templateFile);

        const testing = this.node.tryGetContext("dummyAuth");

        let authorizer: any;
        if (testing === "true") {
            const dummyFunction = new NodejsFunction(this, "dummyAuthorizer", {
                runtime: lambdaDefaults.runtime,
                architecture: lambdaDefaults.architecture,
                entry: "src/api/dummy-authorizer.ts",
                memorySize: 256,
            });
            dummyFunction.addPermission("dummyAuthPermissions", {
                principal: new ServicePrincipal("apigateway.amazonaws.com"),
            });
            const {region, partition} = Arn.split(dummyFunction.functionArn, ArnFormat.COLON_RESOURCE_NAME);
            authorizer = {
                type: "token",
                authorizerUri: `arn:${partition}:apigateway:${region}:lambda:path/2015-03-31/functions/${dummyFunction.functionArn}/invocations`,
                authorizerResultTtlInSeconds: 0,
            };
            new CfnOutput(this, "arn", {
                value: dummyFunction.functionArn,
            });
        }
        else {
            authorizer = {
                "type": "cognito_user_pools",
                "providerARNs": [
                    this.cognito.userPool.userPoolArn,
                ],
            };
        }
        if (template["components"]["securitySchemes"]) {
            for (const security in template["components"]["securitySchemes"]) {
                const definition = template["components"]["securitySchemes"][security];
                if (definition["x-amazon-apigateway-authtype"] === "cognito_user_pools") {
                    template["components"]["securitySchemes"][security]["x-amazon-apigateway-authorizer"] = authorizer;
                }
            }
        }

        const functions: {[key: string]: NodejsFunction} = {};
        const permissionFuncs: ((api: IRestApi) => void)[] = [];
        for (const resourcePath in template.paths) {
            const resourceDefinition = template.paths[resourcePath];
            // sometimes a path is ignored, I guess
            if (resourceDefinition["x-generation-exclude"]) {
                delete template.paths[resourcePath];
                continue;
            }

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
                // if you haven't used this function before (it's an edge case that you'd ever reuse a function but... here we are. I'll be honest I don't remember why I decided to implement it)
                if (!functions[name]) {
                    // set up environment variables
                    const environment: any = {};
                    for (const dependency of dependencies) {
                        if (dependency.startsWith("document-metadata-")) {
                            environment["DYNAMO_TABLE"] = this.storage.table.tableName;
                        }
                        else if (dependency === "s3-signing") {
                            environment["S3_BUCKET"] = this.storage.bucket.bucketName;
                        }
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
                            case "document-metadata-read":
                                this.lambdaPolicies.documentMetadataRead.attachToRole(lambdaFunction.role);
                                break;
                            case "document-metadata-write":
                                this.lambdaPolicies.documentMetadataWrite.attachToRole(lambdaFunction.role);
                                break;
                            case "s3-signing":
                                // cause s3 signing is done with the lambda function's role, so it needs to have these permissions
                                this.lambdaPolicies.documentReadWrite.attachToRole(lambdaFunction.role);
                                break;
                        }
                    }
                    functions[name] = lambdaFunction;
                } else {
                    lambdaFunction = functions[name];
                }

                // now we add the lambda function to the thing?
                resourceDefinition[method]["x-amazon-apigateway-integration"] = {
                    httpMethod: "POST", // lambda is always POST
                    type: "AWS_PROXY",
                    uri: `arn:aws:apigateway:${Stack.of(this).region}:lambda:path/2015-03-31/functions/${lambdaFunction.functionArn}/invocations`, // dear lord please let this work
                };

                // now we add the right permissions to API gateway
                permissionFuncs.push((api) => {
                    lambdaFunction.addPermission(name + resourcePath, {
                        principal: new ServicePrincipal("apigateway.amazonaws.com"),
                        sourceArn: api.arnForExecuteApi(method.toUpperCase(), resourcePath, api.deploymentStage.stageName),
                    });
                    lambdaFunction.addPermission(name + resourcePath + "test-execute", {
                        principal: new ServicePrincipal("apigateway.amazonaws.com"),
                        sourceArn: api.arnForExecuteApi(method.toUpperCase(), resourcePath, "test-invoke-stage"),
                    });
                });
            }
        }
        return {
            definition: new InlineApiDefinition(template),
            permissionFuncs,
        };
    }
}
