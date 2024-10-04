import {Duration, RemovalPolicy} from "aws-cdk-lib";
import {OriginAccessIdentity} from "aws-cdk-lib/aws-cloudfront";
import {AttributeType, ProjectionType, TableV2} from "aws-cdk-lib/aws-dynamodb";
import {CanonicalUserPrincipal, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {Bucket, HttpMethods, LifecycleRule} from "aws-cdk-lib/aws-s3";
import {Construct} from "constructs";

export interface OceanicDocumentBucketProps {
    isProd: boolean
}

export class OceanicStorage extends Construct {
    bucket: Bucket;
    table: TableV2;
    originAccessIdentity: OriginAccessIdentity;
    constructor(scope: Construct, id: string, props: OceanicDocumentBucketProps) {
        super(scope, id);

        // Define bucket
        this.originAccessIdentity = new OriginAccessIdentity(this, "Cloudfront-OAI");
        this.bucket = new Bucket(this, "bucket", {
            removalPolicy: props?.isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
            autoDeleteObjects: !props.isProd,
            enforceSSL: true,
            lifecycleRules: this.defineLifecycleRules(),
            versioned: true,
            cors: [{
                allowedOrigins: ["*"],
                allowedHeaders: ["*"],
                allowedMethods: [
                    HttpMethods.GET,
                    HttpMethods.PUT,
                    HttpMethods.DELETE
                ]
            }]
        });
        this.bucket.addToResourcePolicy(new PolicyStatement({
            actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            resources: [this.bucket.arnForObjects("*")],
            principals: [new CanonicalUserPrincipal(this.originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
        }));

        // Define dynamo table
        this.table = new TableV2(this, "table", {
            removalPolicy: props?.isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
            partitionKey: {name: "dataTypeUser", type: AttributeType.STRING},
            sortKey: {name: "id", type: AttributeType.STRING},
            localSecondaryIndexes: [
                {
                    indexName: "documentUpdatedSort",
                    sortKey: {
                        name: "documentUpdated",
                        type: AttributeType.NUMBER,
                    },
                    projectionType: ProjectionType.INCLUDE,
                    nonKeyAttributes: [
                        "id",
                        "documentTitle",
                        "documentType",
                        "documentCreated",
                        "documentKey",
                    ],
                },
                {
                    indexName: "documentCreatedSort",
                    sortKey: {
                        name: "documentUpdated",
                        type: AttributeType.NUMBER,
                    },
                    projectionType: ProjectionType.INCLUDE,
                    nonKeyAttributes: [
                        "id",
                        "documentTitle",
                        "documentType",
                        "documentUpdated",
                        "documentKey",
                    ],
                },
            ],
        });
    }

    private defineLifecycleRules(): LifecycleRule[] {
        return [
            // Global definitions
            {
                enabled: true,
                //abortIncompleteMultipartUploadAfter: Duration.days(1), I don't think I actually want this, cause it would mean that if you're live-creating a video it could just get killed if it failed to commit to the upload
                expiredObjectDeleteMarker: true,
                noncurrentVersionsToRetain: 3,
                noncurrentVersionExpiration: Duration.days(7) // This is mainly intended to purge objects with a delete tag
            },
            // todo: add version retaining settings based on various criteria (like object size or tags)
        ]
    }
}
