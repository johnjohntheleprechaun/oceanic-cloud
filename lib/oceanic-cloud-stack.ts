import * as cdk from 'aws-cdk-lib';
import { CognitoUserPoolsAuthorizer, IdentitySource, LambdaIntegration, RequestAuthorizer, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AllowedMethods, CachePolicy, Distribution, OriginAccessIdentity, PriceClass } from 'aws-cdk-lib/aws-cloudfront';
import { RestApiOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AccountRecovery, Mfa, UserPool, UserPoolEmail, VerificationEmailStyle } from 'aws-cdk-lib/aws-cognito';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
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
        const api = new RestApi(this, "oceanic-api", {
            deployOptions: {
                stageName: "v1"
            }
        });
        // User pool definition
        const userPool = new UserPool(this, "users", {
            deletionProtection: props?.isProd,
            accountRecovery: AccountRecovery.EMAIL_ONLY,
            email: UserPoolEmail.withCognito(),
            mfa: Mfa.REQUIRED,
            mfaSecondFactor: {
                sms: true,
                otp: true
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
                tempPasswordValidity: cdk.Duration.days(1)
            },
            selfSignUpEnabled: false,
            signInAliases: {
                email: true,
                preferredUsername: true,
                username: true
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true
                }
            },
            userInvitation: {
                emailSubject: "Invitation to join Oceanic",
                emailBody: "Hello {username}, welcome to Oceanic! Your temporary password is {####}",
                smsMessage: "Hello {username}, welcome to Oceanic! Your temporary password is {####}"
            },
            userVerification: {
                emailSubject: "Verify your email for Oceanic",
                emailBody: "Thanks for creating an account! {##Verify Email##}",
                emailStyle: VerificationEmailStyle.LINK,
                smsMessage: "Thanks for creating an Oceanic account! Your verificatio code is {####}"
            }
        });
        new cdk.CfnOutput(this, "user-pool", { value: `${userPool.userPoolId}` })

        // Storage resources
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
        const accessIdentity = new OriginAccessIdentity(this, "s3-access-identity");
        userDocuments.grantReadWrite(accessIdentity);
        const cdn = new Distribution(this, "oceanic-distro", {
            defaultBehavior: {
                origin: new RestApiOrigin(api),
                allowedMethods: AllowedMethods.ALLOW_ALL,
                cachePolicy: CachePolicy.CACHING_DISABLED
            },
            additionalBehaviors: {
                "documents/*": {
                    origin: new S3Origin(userDocuments, {
                        originPath: "/",
                        originAccessIdentity: accessIdentity
                    }),
                    cachePolicy: CachePolicy.CACHING_DISABLED
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
