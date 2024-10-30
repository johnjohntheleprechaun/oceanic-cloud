import {UrlPair} from "../schema-types/url-pair";
import {GetObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {DocumentAttachment} from "../schema-types/attachment";

interface SignerOptions {
    /**
     * The UUID of the document's owner
     */
    owner: string,
    /**
     * The document's id
     */
    document: string,
    /**
     * Whether this should be writeable
     */
    canWrite: boolean,
    /**
     * The id of the attachment, if you're signing an attachment
     */
    attachment?: string,
}
const client: S3Client = new S3Client();

export async function signUrls(options: SignerOptions): Promise<UrlPair> {
    const objectKey = `${options.owner}/documents/${options.document}${options.attachment ? `/attachments/${options.attachment}` : "/content"}`;
    const getCommand = new GetObjectCommand({
        Bucket: process.env["S3_BUCKET"],
        Key: objectKey,
    });
    const putCommand = new PutObjectCommand({
        Bucket: process.env["S3_BUCKET"],
        Key: objectKey,
    });
    return {
        read: await getSignedUrl(client, getCommand),
        ...(options.canWrite && {write: await getSignedUrl(client, putCommand)}),
    };
}

export async function signAttachments(owner: string, documentId: string, attachments: DocumentAttachment[], canWrite: boolean): Promise<DocumentAttachment[]> {
    const signed: DocumentAttachment[] = [];
    for (const attachment of attachments) {
        signed.push({
            id: attachment.id,
            type: attachment.type,
            signedUrls: await signUrls({
                owner,
                document: documentId,
                attachment: attachment.id,
                canWrite,
            }),
        });
    }
    return signed;
}
