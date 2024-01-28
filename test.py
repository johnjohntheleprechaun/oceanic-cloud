import requests

api_endpoint = "https://j7d7wuwdb7.execute-api.us-west-2.amazonaws.com/prod"
oceanic_endpoint = "https://oceanic.api.leprechaun.dev"
local_endpoint = "http://localhost:3000"
req = requests.post(local_endpoint + "/signup", json={"username": "test", "password": "password", "publicKey": "", "privateKey": ""})
print(req.text)