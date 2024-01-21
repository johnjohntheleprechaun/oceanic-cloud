import * as cdk from 'aws-cdk-lib';
import { IdentitySource, LambdaIntegration, RequestAuthorizer, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import path = require('path');
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const lambdaDefaults = {
    runtime: Runtime.NODEJS_20_X,
    architecture: Architecture.ARM_64,
    directory: path.join(__dirname, "functions")
}

export class OceanicCloudStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Define the basics of the API
        const api = new RestApi(this, "oceanic-api");
        // Add the authorizer
        const authFunction = new NodejsFunction(this, "auth-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "authorizer.ts")
        })
        const authorizer = new RequestAuthorizer(this, "authorizer", {
            handler: authFunction,
            identitySources: [IdentitySource.header("Authorization")]
        })

        // Test endpoint
        const testFunction = new NodejsFunction(this, "test-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "test.ts")
        });
        const testIntegration = new LambdaIntegration(testFunction);
        api.root.addResource("test")
            .addMethod("GET", testIntegration, { authorizer: authorizer});
        
        api.root.addResource("test2")
        .addMethod("GET", testIntegration, { authorizer: authorizer });

        const documentBucket = new Bucket(this, "user-documents");
        const oceanicDB = new TableV2(this, "oceanic-db", {
            partitionKey: { name: "user", type: cdk.aws_dynamodb.AttributeType.STRING },
            sortKey: { name: "data-type", type: cdk.aws_dynamodb.AttributeType.STRING },
        });
    }
}
