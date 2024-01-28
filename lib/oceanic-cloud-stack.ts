import * as cdk from 'aws-cdk-lib';
import { IdentitySource, LambdaIntegration, RequestAuthorizer, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
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

interface OceanicStackProps extends cdk.StackProps {
    isProd: boolean
    domainName?: string
    certArn?: string
}
export class OceanicCloudStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: OceanicStackProps) {
        super(scope, id, props);
        
        const dynamoName = `oceanic-${props?.isProd ? "prod" : "test"}-db`;
        const bucketName = `oceanic-${props?.isProd ? "prod" : "test"}-documents`;
        console.log(props?.isProd);
        console.log(`Table name: ${dynamoName}\nBucket name: ${bucketName}`);

        // Define non-lambda resources
        const api = new RestApi(this, "oceanic-api");
        const userDocuments = new Bucket(this, "user-documents", {
            bucketName: bucketName,
            removalPolicy: props?.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
        });
        const oceanicDB = new TableV2(this, "oceanic-db", {
            tableName: dynamoName,
            removalPolicy: props?.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            partitionKey: { name: "user", type: cdk.aws_dynamodb.AttributeType.STRING },
            sortKey: { name: "dataType", type: cdk.aws_dynamodb.AttributeType.STRING },
        });

        // Define cloudfront distro
        let certificate: ICertificate | undefined;
        if (props?.certArn) {
            certificate = Certificate.fromCertificateArn(this, "cert-arn", props?.certArn);
        }
        const cdn = new Distribution(this, "oceanic-distro", {
            defaultBehavior: {
                origin: new RestApiOrigin(api, {
                    originPath: "prod",
                }),
                allowedMethods: AllowedMethods.ALLOW_ALL
            },
            additionalBehaviors: {
                "files/*": {
                    origin: new S3Origin(userDocuments)
                }
            },
            domainNames: props?.domainName ? [props.domainName] : undefined,
            certificate: certificate,
            enabled: true,
            priceClass: PriceClass.PRICE_CLASS_100
        });
        new cdk.CfnOutput(this, "cloudfront-domain", { value: `https://${cdn.distributionDomainName}` })

        // Add API authorizer
        const authFunction = new NodejsFunction(this, "auth-function", {
            runtime: lambdaDefaults.runtime,
            architecture: lambdaDefaults.architecture,
            entry: path.join(lambdaDefaults.directory, "authorizer.ts"),
            environment: { "DYNAMO_TABLE": dynamoName }
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
            environment: { "DYNAMO_TABLE": dynamoName }
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
            environment: { DYNAMO_TABLE: dynamoName, BUCKET: bucketName }
        });
        const testIntegration = new LambdaIntegration(testFunction);
        api.root.addResource("test")
            .addMethod("GET", testIntegration);
        
        api.root.addResource("test2")
        .addMethod("GET", testIntegration, { authorizer: authorizer });
    }
}
