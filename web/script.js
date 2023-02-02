// sha256 hasher for the browser
const sha256 = Multiformats.hasher.from({
	// As per multiformats table
	// https://github.com/multiformats/multicodec/blob/master/table.csv#L9
	name: 'sha2-256',
	code: 0x12,

	encode: (input) => (async () => new Uint8Array(await crypto.subtle.digest('SHA-256', input)))()
});

// The codecs we support
const codecs = {
	[IpldDagCbor.code]: IpldDagCbor,
	[IpldDagPb.code]: IpldDagPb,
	[IpldDagJson.code]: IpldDagJson,
//	[raw.code]: raw,
//	[json.code]: json
}

// The hashes we support
const hashes = {
	[sha256.code]: sha256,
//	[blake2b256.code]: hasher(blake2b256)
}

// The gateways we can use
const gateways = [
	{ url: "https://dweb.link/", subdomain: true },
	{ url: "https://ipfs.io/", subdomain: false },
	{ url: "https://ipfs.runfission.com/", subdomain: false },
	{ url: "https://jorropo.net/", subdomain: false },
	{ url: "https://ipfs.czip.it/", subdomain: false },
	{ url: "https://ipfs.best-practice.se/", subdomain: false },
	{ url: "https://storry.tv/", subdomain: true },
	{ url: "https://ipfs.litnet.work/", subdomain: false }
];

// _fetchCar fetches a CAR file from a random gateway and verifies it
async function _fetchCar(cid) {
	let gateway = gateways[Math.floor(Math.random()*gateways.length)];
	console.log(`Using gateway: ${gateway.url}`);
	fetchCar(cid, gateway);
}

// fetchCar fetches a CAR file from the given gateway and verifies it
async function fetchCar(cid, gateway) {
	let url = undefined;
	// If the gateway uses subdomains, we need to construct the URL differently
	if (!gateway.subdomain) {
		url = `${gateway.url}ipfs/${cid}`;
	} else {
		let [proto, host] = gateway.url.split("://");
		// Convert CID to v1 because v0 CIDs are not supported on subdomains
		cid = Multiformats.CID.parse(cid).toV1().toString();
		url = `${proto}://${cid}.ipfs.${host}`;
	}

	// Fetch the CAR file from the gateway
	const res = await fetch(url, {
		method: 'GET',
		headers: {
			// Set the Accept header to request a CAR file
			Accept: 'application/vnd.ipld.car',
		},
	})
	if (res.status > 400) {
		throw new Error(`${res.status} ${res.statusText} ${url}`);
	}
	if (res.body === null) {
		throw new Error(`response is null`);
	}

	// Verify the CAR file
	verifyCar(new Uint8Array(await res.arrayBuffer()), cid);
}

// verifyCar verifies a CAR file
async function verifyCar(carFile, cid) {
	// Create a CAR block iterator from the bytes
	const car = await IpldCar.CarBlockIterator.fromBytes(carFile);
	
	//  Verify step 1: if we know what CID to expect, check that's indeed what we've got
	if (cid != undefined) {
		if (!Multiformats.CID.parse(cid).equals(car._roots[0])) {
			console.log(`Mismatch: root CID of CAR (${car._roots[0].toString()}) does not match expected CID (${cid})`);
			return;
		}
	}

	for await (const { bytes, cid } of car) {
		// Verify step 2: is this a CID we know how to deal with?
		if (!codecs[cid.code]) {
			console.log(`Unexpected codec: 0x${cid.code.toString(16)}`);
			return;
		}
		if (!hashes[cid.multihash.code]) {
			console.log(`Unexpected multihash code: 0x${cid.multihash.code.toString(16)}`);
			return;
		}

		// Verify step 3: if we hash the bytes, do we get the same digest as reported by the CID?
		const hash = await hashes[cid.multihash.code].digest(bytes)
		if (Multiformats.bytes.toHex(hash.digest) !== Multiformats.bytes.toHex(cid.multihash.digest)) {
			console.log(`Mismatch: digest of bytes does not match digest in CID: ${cid}`);
			return;
		}

		console.log("This CAR seems legit!");
	}
}

// readFile reads a CAR file from disk and verifies it
function readFile(input) {
	let file = input.files[0];

	// Read the file into an ArrayBuffer
	let reader = new FileReader();
	reader.readAsArrayBuffer(file);

	reader.onload = function() {
		let cid = undefined;
		let nameSplit = file.name.split(".car");
		if (nameSplit.length == 2) {
			try {
				// If the left half of the filename is a CID, and the right half is ".car", use the left half as a CID to verify against
				cid = Multiformats.CID.parse(nameSplit[0]).toV1().toString();
			} catch {}
		}
		// Verify the CAR file
		verifyCar(new Uint8Array(reader.result), cid);
	};

	reader.onerror = function() {
		console.log(reader.error);
	};

}