import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { AccountRecovery, CfnIdentityPool, CfnUserPoolGroup, ClientAttributes, Mfa, StringAttribute, UserPool, UserPoolClient, UserPoolEmail, VerificationEmailStyle } from "aws-cdk-lib/aws-cognito";
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Effect, FederatedPrincipal, PolicyDocument, PolicyStatement, Role } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

interface OceanicUserPoolProps {
    isProd: boolean;
    dynamoTable: TableV2;
    s3Bucket: Bucket;
    logoutUrls: string[];
    callbackUrls: string[];
}

export class OceanicUserPool extends Construct {
    public userPool: UserPool;
    public groups: CfnUserPoolGroup[];
    public identityPool: CfnIdentityPool;
    public clients: UserPoolClient[];
    private isProd: boolean;

    constructor (scope: Construct, id: string, props: OceanicUserPoolProps) {
        super(scope, id);
        this.isProd = props.isProd;
        this.clients = [];
        this.userPool = this.defineUserPool(props.callbackUrls, props.logoutUrls);
        this.identityPool = this.defineIdentityPool();
        this.createGroups(this.userPool, props.dynamoTable, props.s3Bucket);
        new CfnOutput(this, "user-pool", { value: `${this.userPool.userPoolId}` });
    }

    private createGroups(userPool: UserPool, dynamoTable: TableV2, s3Bucket: Bucket): CfnUserPoolGroup[] {
        const groups: CfnUserPoolGroup[] = [];

        // create policy docs
        const userPrefixARN = s3Bucket.arnForObjects("${cognito-identity.amazonaws.com:sub}/*");
        new CfnOutput(this, "userPrefix", { value: userPrefixARN });
        const readData = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    actions: [ "dynamodb:Query", "dynamodb:GetItem" ],
                    resources: [ dynamoTable.tableArn ],
                    conditions: {
                        "StringEquals": { "dynamodb:LeadingKeys": "${cognito-identity.amazonaws.com:sub}" }
                    },
                    effect: Effect.ALLOW
                }),
                new PolicyStatement({
                    actions: [ "s3:GetObject", "s3:GetObjectVersion" ],
                    resources: [ s3Bucket.arnForObjects("${cognito-identity.amazonaws.com:sub}/*") ],
                    effect: Effect.ALLOW
                }),
                new PolicyStatement({
                    actions: [ "s3:ListBucket", "s3:ListBucketVersions" ],
                    resources: [ s3Bucket.bucketArn ],
                    conditions: {
                        "ForAllValues:StringLike": { "s3:prefix": "${cognito-identity.amazonaws.com:sub}/*" }
                    },
                    effect: Effect.ALLOW
                })
            ]
        });
        const writeData = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    actions: [ "dynamodb:PutItem" ],
                    resources: [ dynamoTable.tableArn ],
                    conditions: {
                        "StringEquals": { "dynamodb:LeadingKeys": "${cognito-identity.amazonaws.com:sub}" }
                    },
                    effect: Effect.ALLOW
                }),
                new PolicyStatement({
                    actions: [ "s3:PutObject" ],
                    resources: [ s3Bucket.arnForObjects("${cognito-identity.amazonaws.com:sub}/*") ],
                    effect: Effect.ALLOW
                })
            ]
        });
        const idPoolPrincipal = new FederatedPrincipal("cognito-identity.amazonaws.com", {
            "StringEquals": { "${cognito-identity.amazonaws.com:aud}": this.identityPool.ref },
            "ForAnyValue:StringLike": { "${cognito-identity.amazonaws.com:aud}": "authenticated" }
        }, "sts:AssumeRoleWithWebIdentity");
        // paid user
        const paidRole = new Role(this, "paid-role", {
            assumedBy: idPoolPrincipal,
            inlinePolicies: {
                readData,
                writeData
            }
        });
        const expiredRole = new Role(this, "expired-role", {
            assumedBy: idPoolPrincipal,
            inlinePolicies: {
                readData
            }
        });
        const paidGroup = new CfnUserPoolGroup(this, "paid-group", {
            userPoolId: userPool.userPoolId,
            roleArn: paidRole.roleArn
        });
        const expiredGroup = new CfnUserPoolGroup(this, "expired-group", {
            userPoolId: userPool.userPoolId,
            roleArn: expiredRole.roleArn
        });

        this.groups = [ paidGroup, expiredGroup ];

        return groups;
    }

    private defineIdentityPool(): CfnIdentityPool {
        return new CfnIdentityPool(this, "oceanic-identity-pool", {
            allowUnauthenticatedIdentities: false,
            allowClassicFlow: false,
            
            cognitoIdentityProviders: this.clients.map(client => ({
                clientId: client.userPoolClientId,
                providerName: this.userPool.userPoolProviderName,
                serverSideTokenCheck: true
            }))
            
        })
    }

    private defineUserPool(callbackUrls: string[], logoutUrls: string[]): UserPool {
        const pool = new UserPool(this, "oceanic-user-pool", {
            deletionProtection: this.isProd,
            removalPolicy: this.isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
            accountRecovery: AccountRecovery.EMAIL_ONLY,
            email: UserPoolEmail.withCognito(),
            mfa: Mfa.REQUIRED,
            mfaSecondFactor: {
                sms: true,
                otp: true
            },
            autoVerify: {
                email: true,
                phone: true
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
                tempPasswordValidity: Duration.days(1)
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
                },
                preferredUsername: {
                    required: false,
                    mutable: true
                }
            },
            customAttributes: {
                "tier": new StringAttribute({ mutable: true })
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
            },
            deviceTracking: {
                challengeRequiredOnNewDevice: true,
                deviceOnlyRememberedOnUserPrompt: true
            }
        });

        const standardAttributes = new ClientAttributes().withStandardAttributes({
            preferredUsername: true,
            nickname: true,
            email: true,
            phoneNumber: true
        });

        
        const webClient = pool.addClient("web client", {
            accessTokenValidity: Duration.hours(1),
            idTokenValidity: Duration.hours(1),
            refreshTokenValidity: Duration.days(1),
            authFlows: {
                userPassword: true,
                userSrp: true
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true
                },
                callbackUrls,
                logoutUrls
            },
            enableTokenRevocation: true,
            generateSecret: false,
            preventUserExistenceErrors: true,
            writeAttributes: standardAttributes
        });

        this.clients = [ webClient ];
        return pool;
    }
}