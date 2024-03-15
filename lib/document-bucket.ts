import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Bucket, LifecycleRule } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface OceanicDocumentBucketProps {
    isProd: boolean
}

export class OceanicDocumentBucket extends Construct {
    bucket: Bucket;
    constructor (scope: Construct, id: string, props: OceanicDocumentBucketProps) {
        super(scope, id);
        this.bucket = new Bucket(this, "user-documents", {
            removalPolicy: props?.isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
            autoDeleteObjects: !props.isProd,
            enforceSSL: true,
            lifecycleRules: this.defineLifecycleRules(),
            versioned: true
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