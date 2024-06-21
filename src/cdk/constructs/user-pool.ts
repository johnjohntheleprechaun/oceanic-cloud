import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { AccountRecovery, CfnIdentityPool, CfnUserPoolGroup, ClientAttributes, Mfa, StringAttribute, UserPool, UserPoolClient, UserPoolEmail, VerificationEmailStyle } from "aws-cdk-lib/aws-cognito";
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Effect, FederatedPrincipal, PolicyDocument, PolicyStatement, Role } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

interface OceanicUserPoolProps {
    isProd: boolean;
    logoutUrls: string[];
    callbackUrls: string[];
}

export class OceanicUsers extends Construct {
    public userPool: UserPool;
    public clients: UserPoolClient[];
    private isProd: boolean;

    constructor (scope: Construct, id: string, props: OceanicUserPoolProps) {
        super(scope, id);
        this.isProd = props.isProd;
        this.clients = [];
        this.userPool = this.defineUserPool(props.callbackUrls, props.logoutUrls);
        const paidGroup = new CfnUserPoolGroup(this, "paid-group", {
            userPoolId: this.userPool.userPoolId
        });
        const expiredGroup = new CfnUserPoolGroup(this, "expired-group", {
            userPoolId: this.userPool.userPoolId
        });
        new CfnOutput(this, "user-pool", { value: `${this.userPool.userPoolId}` });
    }

    private defineUserPool(callbackUrls: string[], logoutUrls: string[]): UserPool {
        const pool = new UserPool(this, "oceanic-user-pool", {
            deletionProtection: this.isProd,
            removalPolicy: this.isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
            accountRecovery: AccountRecovery.EMAIL_ONLY,
            email: UserPoolEmail.withCognito(),
            mfa: Mfa.OPTIONAL, // So this is some BS, but if MFA is required then when signing in for the first time you can't get tokens after setting it up (or at least it's not documented)
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
                "tier": new StringAttribute({ mutable: true }),
                "identityId": new StringAttribute({ mutable: true })
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
            refreshTokenValidity: Duration.days(30),
            authFlows: {
                userPassword: true,
                userSrp: true
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