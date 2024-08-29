import {DocumentCreate} from "../schema-types/document-create"

async function documentCreateTest() {
    const uuid = crypto.randomUUID();
    const request: DocumentCreate = {
        type: "messages-journal",
        documentKey: "",
        id: uuid,
    };
    const url = process.argv[process.argv.length - 2] + "/users/me/documents";
    const token = process.argv[process.argv.length - 1];
    console.log(token);
    const newDocument = await fetch(url, {
        method: "POST",
        body: JSON.stringify(request),
        headers: {
            "Authorization": token,
        },
    }).then(resp => resp.json())
    console.log(newDocument);

    const fetchedDocument = await fetch(`${url}/${uuid}`, {headers: {"Authorization": token}}).then(resp => resp.json());
    console.log(fetchedDocument);
}

documentCreateTest();
