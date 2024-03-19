import { CognitoUserPoolsAuthorizer, Cors, LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from "constructs";
import { OceanicUserPool } from "./user-pool";
import { lambdaDefaults } from "./oceanic-cloud-stack";
import path = require("path");
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { OceanicDocumentBucket } from "./document-bucket";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

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

    constructor (scope: Construct, id: string, props: OceanicApiProps) {
        super(scope, id)
        // API definition
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

        this.defineIntegrations(props.database, props.documents, props.cognito);
    }

    defineRegisterEndpoint(cognito: OceanicUserPool) {
        const registerFunction = new NodejsFunction(this, "register-function", {
            ...lambdaDefaults,
            entry: path.join(lambdaDefaults.directory, "register.ts"),
            environment: {
                IDENTITY_POOL_ID: cognito.identityPool.attrId
            }
        });
        const registerIntegration = new LambdaIntegration(registerFunction);
        this.api.root.addResource("users")
        .addResource("register")
        .addMethod("POST", registerIntegration, { authorizer: this.cognitoAuthorizer });
    }

    defineIntegrations(database: TableV2, documents: OceanicDocumentBucket, cognito: OceanicUserPool) {
        // Resource List
        const resourceListFunction = new NodejsFunction(this, "resource-list-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "resource-list.ts"),
            environment: {
                DYNAMO_TABLE: database.tableName,
                BUCKET: documents.bucket.bucketName,
                IDENTITY_POOL_ID: cognito.identityPool.attrId,
                USER_POOL_ID: cognito.userPool.userPoolProviderName
            }
        });
        const resourceListIntegration = new LambdaIntegration(resourceListFunction);
        this.api.root.addResource("resources")
        .addMethod("GET", resourceListIntegration);

        this.defineRegisterEndpoint(cognito);

        // Test endpoint
        const testFunction = new NodejsFunction(this, "test-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "test.ts"),
            environment: { DYNAMO_TABLE: database.tableName, BUCKET: documents.bucket.bucketName }
        });
        
        const testIntegration = new LambdaIntegration(testFunction);
        this.api.root.addResource("test")
            .addMethod("GET", testIntegration);
        
        this.api.root.addResource("test2")
        .addMethod("GET", testIntegration, { authorizer: this.cognitoAuthorizer });
    }
}