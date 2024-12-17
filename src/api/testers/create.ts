import {DocumentCreateRequest} from "../schema-types/document-create"

async function documentCreateTest() {
    const uuid = crypto.randomUUID();
    const request: DocumentCreateRequest = {
        type: "messages-journal",
        documentKey: "00",
        id: uuid,
    };
    console.log(request);
    const url = process.argv[process.argv.length - 2] + "/users/me/documents";
    const token = process.argv[process.argv.length - 1];
    console.log(token);
    console.log(url)
    const newDocument = await fetch(url, {
        method: "POST",
        body: JSON.stringify(request),
        headers: {
            "Authorization": token,
        },
    }).then(async resp => [await resp.json(), resp.status])
    console.log(newDocument);

    let documentUrl = `${url}/${uuid}`
    console.log(documentUrl)
    const fetchedDocument = await fetch(documentUrl, {
        headers: {
            'Authorization': token
        }
    }).then(resp => resp.json());
    console.log(fetchedDocument);
}

documentCreateTest();
