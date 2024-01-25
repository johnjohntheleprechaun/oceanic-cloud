import * as cdk from 'aws-cdk-lib';
import { IdentitySource, LambdaIntegration, RequestAuthorizer, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AllowedMethods, Distribution, PriceClass } from 'aws-cdk-lib/aws-cloudfront';
import { RestApiOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import path = require('path');

const lambdaDefaults = {
    runtime: Runtime.NODEJS_20_X,
    architecture: Architecture.ARM_64,
    directory: path.join(__dirname, "functions")
}

export class OceanicCloudStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Define non-lambda resources
        const api = new RestApi(this, "oceanic-api");
        const oceanicFiles = new Bucket(this, "user-documents");
        const oceanicDB = new TableV2(this, "oceanic-db", {
            partitionKey: { name: "user", type: cdk.aws_dynamodb.AttributeType.STRING },
            sortKey: { name: "dataType", type: cdk.aws_dynamodb.AttributeType.STRING },
        });

        // Define cloudfront distro
        const domainName = new cdk.CfnParameter(this, "domain", {
            type: "String",
            description: "The domain name for the cloudfront distribution. Leave empty if none"
        });
        let certArn = new cdk.CfnParameter(this, "domain-cert", {
            type: "String",
            description: "The ARN of the certificate for the cloudfront distribution."
        });
        let certificate = Certificate.fromCertificateArn(this, "cert-arn", certArn.valueAsString);
        const cdn = new Distribution(this, "oceanic-distro", {
            defaultBehavior: {
                origin: new RestApiOrigin(api, {
                    originPath: "dist",
                }),
                
                allowedMethods: AllowedMethods.ALLOW_ALL
            },
            additionalBehaviors: {
                "files": {
                    origin: new S3Origin(oceanicFiles)
                }
            },
            domainNames: [domainName.valueAsString],
            certificate: certificate,
            enabled: true,
            priceClass: PriceClass.PRICE_CLASS_100
        });

        // Add API authorizer
        const authFunction = new NodejsFunction(this, "auth-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "authorizer.ts"),
            environment: { "DYNAMO_TABLE": oceanicDB.tableName }
        });
        const authorizer = new RequestAuthorizer(this, "authorizer", {
            handler: authFunction,
            identitySources: [IdentitySource.header("Authorization")]
        });

        // Signup endpoint
        const signupFunction = new NodejsFunction(this, "signup-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "signup.ts"),
            timeout: cdk.Duration.minutes(1),
            environment: { "DYNAMO_TABLE": oceanicDB.tableName }
        });
        oceanicDB.grant(signupFunction, "dynamodb:PutItem");
        const signupIntegration = new LambdaIntegration(signupFunction)
        api.root.addResource("signup")
            .addMethod("POST", signupIntegration);

        // Test endpoint
        const testFunction = new NodejsFunction(this, "test-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "test.ts"),
            environment: { DYNAMO_TABLE: oceanicDB.tableName, DYNAMO_ARN: oceanicDB.tableArn }
        });
        const testIntegration = new LambdaIntegration(testFunction);
        api.root.addResource("test")
            .addMethod("GET", testIntegration);
        
        api.root.addResource("test2")
        .addMethod("GET", testIntegration, { authorizer: authorizer });
    }
}
