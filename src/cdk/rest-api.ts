import { CognitoUserPoolsAuthorizer, Cors, LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from "constructs";
import { OceanicUserPool } from "./user-pool";
import { lambdaDefaults } from "./oceanic-cloud-stack";
import path = require("path");
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { OceanicDocumentBucket } from "./document-bucket";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { parse } from "yaml";
import { openSync, readFileSync } from "fs";

interface OceanicApiProps {
    isProd: boolean;
    cognito: OceanicUserPool;
    documents: OceanicDocumentBucket;
    database: TableV2;
    domainName?: string;
    certArn?: string;
}

export class OceanicApi extends Construct {
    api: RestApi;
    cognitoAuthorizer: CognitoUserPoolsAuthorizer;
    apiVersion: string;
    database: TableV2;
    documents: OceanicDocumentBucket;
    cognito: OceanicUserPool

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
        /* this.cognitoAuthorizer = new CognitoUserPoolsAuthorizer(this, "cognito-authorizer", {
            cognitoUserPools: [ props.cognito.userPool ]
        }); */
        this.database = props.database;
        this.documents = props.documents;
        this.cognito = props.cognito;

        this.loadApiDefinition("src/api/definition.yml", "src/api/endpoints");
    }

    /**
     * Create an API from a custom OpenAPI file. To be clear, this is *not* the same as defining an API gateway with a file. This is fully custom, with the reason for using OpenAPI being easier documentation and better code organization.
     * @param baseApi The api to create endpoints on
     * @param templatePath The path of the OpenAPI template file
     * @param baseFunctionPath The base path for lambda function entrypoints in x-lambda-entry
     */
    loadApiDefinition(templatePath: string, baseFunctionPath: string) {
        const templateContent = readFileSync(templatePath).toString();
        const template = parse(templateContent);
        const functions: { [key: string]: NodejsFunction } = {};
        for (const resourcePath in template.paths) {
            const resourceDefinition = template.paths[resourcePath];

            if (resourceDefinition["x-generation-exclude"]) {
                // don't add this path at all
                continue;
            }
            
            // Create the resource
            const pathParts = resourcePath.split("/")
            for (let i = 0; i < pathParts.length; i++) {
                if (pathParts[i] === "") {
                    pathParts.splice(i, 1);
                }
            }
            console.log(pathParts);
            let resource = this.api.root;
            for (const part of pathParts) {
                const next = resource.getResource(part);
                if (!next) {
                    resource = resource.addResource(part);
                }
                else {
                    resource = next;
                }
            }

            for (const method in resourceDefinition) {
                // Extract path and name
                const entry = path.join(baseFunctionPath, resourceDefinition[method]["x-lambda-entry"]);
                const name = (resourceDefinition[method]["x-lambda-entry"] as string).replace("/", "-").replace(/.(js|ts)$/, "") + "-function";
                console.log(name);

                // Create lambda function
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

                // Add it to the API
                const integration = new LambdaIntegration(lambdaFunction);
                resource.addMethod(method, integration);
            }
        }
    }

    defineIntegrations() {
        // Resource List
        const resourceListFunction = new NodejsFunction(this, "resource-list-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "resource-list.ts"),
            environment: {
                DYNAMO_TABLE: this.database.tableName,
                BUCKET: this.documents.bucket.bucketName,
                IDENTITY_POOL_ID: this.cognito.identityPool.attrId,
                USER_POOL_ID: this.cognito.userPool.userPoolProviderName
            }
        });
        const resourceListIntegration = new LambdaIntegration(resourceListFunction);
        this.api.root.addResource("resources")
        .addMethod("GET", resourceListIntegration);
        
        // Ping
        const pingFunction = new NodejsFunction(this, "ping-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "ping.ts"),
            environment: {
                API_VERSION: this.apiVersion
            }
        });
        const pingIntegration = new LambdaIntegration(pingFunction);
        this.api.root.addResource("ping")
        .addMethod("GET", pingIntegration);
        
        this.defineRegisterEndpoint();
        this.defineJournalOperationEndpoints();
        
        // Test endpoint
        const testFunction = new NodejsFunction(this, "test-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "test.ts"),
            environment: { DYNAMO_TABLE: this.database.tableName, BUCKET: this.documents.bucket.bucketName }
        });
        
        const testIntegration = new LambdaIntegration(testFunction);
        this.api.root.addResource("test")
        .addMethod("GET", testIntegration);
        
        this.api.root.addResource("test2")
        .addMethod("GET", testIntegration, { authorizer: this.cognitoAuthorizer });
    }
    defineRegisterEndpoint() {
        const registerFunction = new NodejsFunction(this, "register-function", {
            ...lambdaDefaults,
            entry: path.join(lambdaDefaults.directory, "register.ts"),
            environment: {
                IDENTITY_POOL_ID: this.cognito.identityPool.attrId,
                USER_POOL_PROVIDER_NAME: this.cognito.userPool.userPoolProviderName,
                USER_POOL_ID: this.cognito.userPool.userPoolId
            }
        });
        registerFunction.addToRolePolicy(new PolicyStatement({
            actions: [
                "cognito-idp:AdminUpdateUserAttributes"
            ],
            resources: [ this.cognito.userPool.userPoolArn ]
        }));
        const registerIntegration = new LambdaIntegration(registerFunction);
        this.api.root.addResource("user")
        .addResource("register")
        .addMethod("POST", registerIntegration, { authorizer: this.cognitoAuthorizer });
    }
    defineJournalOperationEndpoints() {
        const userEndpoint = this.api.root.getResource("user")?.addResource("{userId}")
        const journalEndpoint = userEndpoint?.addResource("document").addResource("{documentId}");

        const getFunction = new NodejsFunction(this, "getDocumentFunction", {
            ...lambdaDefaults,
            entry: path.join(lambdaDefaults.directory, "document", "get.ts"),
            environment: {
                DOCUMENT_BUCKET: this.documents.bucket.bucketName,
                DATABASE_NAME: this.database.tableName,
            }
        });
        const getIntegration = new LambdaIntegration(getFunction);
        journalEndpoint?.addMethod("GET", getIntegration, { authorizer: this.cognitoAuthorizer });
    }
}