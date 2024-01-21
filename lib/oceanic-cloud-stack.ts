import * as cdk from 'aws-cdk-lib';
import { IdentitySource, LambdaIntegration, RequestAuthorizer, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import path = require('path');
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const lambdaDefaults = {
    runtime: Runtime.NODEJS_20_X,
    architecture: Architecture.ARM_64
}

export class OceanicCloudStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Define the basics of the API
        const api = new RestApi(this, "oceanic-api");

        // Test endpoint
        const testFunction = new NodejsFunction(this, "test-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(__dirname, "functions", "test.ts")
        });

        const testIntegration = new LambdaIntegration(testFunction);
        api.root.addMethod("GET", testIntegration);

        const documentBucket = new Bucket(this, "user-documents");
        const oceanicDB = new TableV2(this, "oceanic-db", {
            partitionKey: { name: "user", type: cdk.aws_dynamodb.AttributeType.STRING },
            sortKey: { name: "data-type", type: cdk.aws_dynamodb.AttributeType.STRING },
        });
    }
}
