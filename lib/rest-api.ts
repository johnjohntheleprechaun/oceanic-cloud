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
        this.cognitoAuthorizer = new CognitoUserPoolsAuthorizer(this, "cognito-authorizer", {
            cognitoUserPools: [ props.cognito.userPool ]
        });
        this.database = props.database;
        this.documents = props.documents;
        this.cognito = props.cognito;

        this.defineIntegrations();
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