import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DocumentAccess, DocumentInfo } from "../types/dynamo-types";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const signerOptions = {
    expiresIn: 3600
}

export async function signDocumentUrls(documentInfo: DocumentInfo, permissions: DocumentAccess) {
    const documentId = documentInfo.id.replace(/^document:/, "");
    const s3Client = new S3Client();
    const signedUrls: SignedUrlCollection = {};
    
    // now sign the document url
    const documentKey = `${documentInfo.user}/documents/${documentInfo.id.replace(/^document:/, "")}`;
    const fetchDocumentCommand = new GetObjectCommand({
        Bucket: process.env.DOCUMENT_BUCKET,
        Key: documentKey
    });
    signedUrls[documentId] = {
        read: await getSignedUrl(s3Client, fetchDocumentCommand, signerOptions)
    };

    if (permissions.write) {
        // add a write URL if you've got permissions
        const putDocumentCommand = new PutObjectCommand({
            Bucket: process.env.DOCUMENT_BUCKET,
            Key: documentKey
        });
        signedUrls[documentId].write = await getSignedUrl(s3Client, putDocumentCommand, signerOptions);
    }

    // now for the attachments
    for (const attachment of documentInfo.attachments) {
        const attachmentKey = `${documentInfo.user}/attachments/${attachment}`;
        const getAttachmentCommand = new GetObjectCommand({
            Bucket: process.env.DOCUMENT_BUCKET,
            Key: attachmentKey
        });
        // you shouldn't ever need to write an attachment
        signedUrls[attachment] = {
            read: await getSignedUrl(s3Client, getAttachmentCommand, signerOptions)
        };
    }
}