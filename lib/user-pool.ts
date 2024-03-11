import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { AccountRecovery, CfnIdentityPool, CfnUserPoolGroup, Mfa, StringAttribute, UserPool, UserPoolEmail, VerificationEmailStyle } from "aws-cdk-lib/aws-cognito";
import { FederatedPrincipal, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface OceanicUserPoolProps {
    isProd: boolean;
}

export class OceanicUserPool extends Construct {
    public userPool: UserPool;
    public groups: CfnUserPoolGroup[];
    public identityPool: CfnIdentityPool;
    private isProd: boolean;
    constructor (scope: Construct, id: string, props: OceanicUserPoolProps) {
        super(scope, id);
        this.isProd = props.isProd;
        this.userPool = this.definePool();
        this.createGroups(this.userPool);
        new CfnOutput(this, "user-pool", { value: `${this.userPool.userPoolId}` });
    }

    private createGroups(userPool: UserPool): CfnUserPoolGroup[] {
        const groups: CfnUserPoolGroup[] = [];
        
        // paid user
        const paidRole = new Role(this, "paid-role", {
            assumedBy: new FederatedPrincipal("cognito-identity.amazonaws.com", {
                "StringEquals": { "cognito-identity.amazonaws.com:aud": this.identityPool.ref }
            })
        });
        const tierOne = new CfnUserPoolGroup(this, "paid-group", {
            userPoolId: userPool.userPoolId,
            roleArn: paidRole.roleArn
        });
        groups.push(tierOne);

        return groups;
    }

    private definePool(): UserPool {
        return new UserPool(this, "oceanic-user-pool", {
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
            },
            deviceTracking: {
                challengeRequiredOnNewDevice: true,
                deviceOnlyRememberedOnUserPrompt: true
            }
        });
    }
}