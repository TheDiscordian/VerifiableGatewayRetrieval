import {unpack} from "unpack-car";
let currentFile = undefined;
let firstClick = true;
let firstLog = true;
let tool_transition = false;

// sha256 hasher for the browser
const sha256 = Multiformats.hasher.from({
	// As per multiformats table
	// https://github.com/multiformats/multicodec/blob/master/table.csv#L9
	name: 'sha2-256',
	code: 0x12,

	encode: (input) => (async () => new Uint8Array(await crypto.subtle.digest('SHA-256', input)))()
});
window.sha256 = sha256;

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

function doLog(s, loud = false) {
	let outEle = document.getElementById("output");
	if (loud) {
		if (!firstLog) {
			outEle.innerHTML = s + "<br>" + outEle.innerHTML;
		} else {
			firstLog = false;
			outEle.innerHTML = s;
			// TODO Finish this element, then unhide it.
		}
		// TODO no more alert
		alert(s);
	}
	console.log(s);
}

// _fetchCar fetches a CAR file from a random gateway and verifies it, returning the underlying data
async function _fetchCar(cid) {
	let gateway = gateways[Math.floor(Math.random()*gateways.length)];
	doLog(`Using gateway: ${gateway.url}`);
	return await fetchCar(cid, gateway);
}
window._fetchCar = _fetchCar;

// fetchCar fetches a CAR file from the given gateway and verifies it, returning the underlying data
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
	return await verifyCar(new Uint8Array(await res.arrayBuffer()), cid);
}

// verifyCar verifies a CAR file
async function verifyCar(carFile, cid) {
	// Create a CAR block iterator from the bytes
	// const car = await IpldCar.CarBlockIterator.fromBytes(carFile);
	const car = await IpldCar.CarReader.fromBytes(carFile);
	doLog(car)
	//let returnedBytes = new Uint8Array();
	
	//  Verify step 1: if we know what CID to expect, check that's indeed what we've got
	if (cid != undefined) {
		let root = (await car.getRoots())[0]
		if (!Multiformats.CID.parse(cid).equals(root)) {
			doLog(`Mismatch: root CID of CAR (${root.toString()}) does not match expected CID (${cid})`, true);
			return;
		}
	}

	let extend = function(a, b) {
		let c = new Uint8Array(a.length + b.length);
		c.set(a, 0);
		c.set(b, a.length);
		return c;
	}

	for await (const { bytes, cid } of car.blocks()) {
		// Verify step 2: is this a CID we know how to deal with?
		if (!codecs[cid.code]) {
			doLog(`Unexpected codec: 0x${cid.code.toString(16)}`, true);
			return;
		}
		if (!hashes[cid.multihash.code]) {
			doLog(`Unexpected multihash code: 0x${cid.multihash.code.toString(16)}`, true);
			return;
		}

		// Verify step 3: if we hash the bytes, do we get the same digest as reported by the CID?
		const hash = await hashes[cid.multihash.code].digest(bytes)
		if (Multiformats.bytes.toHex(hash.digest) !== Multiformats.bytes.toHex(cid.multihash.digest)) {
			doLog(`Mismatch: digest of bytes does not match digest in CID: ${cid}`, true);
			return;
		}

		doLog(bytes);
		//returnedBytes = extend(returnedBytes, codecs[cid.code].decode(bytes));
	}

	doLog("This CAR seems legit!", true);

	// Return the underlying data within the CAR file
	//return returnedBytes;
	let f = undefined;
	for await (const file of unpack(car)) {
		f = file;
		break; // Only read one file from CAR
	}
	return f;
}
window.verifyCar = verifyCar;

// setFile sets the currentFile global to the file selected by the user
function setFile(input) {
	currentFile = input.files[0];
}
window.setFile = setFile;

// readFile reads a CAR file from disk and verifies it
function readFile() {
	if (currentFile == undefined) {
		return;
	}
	let file = currentFile;

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
		doLog(reader.error, true);
	};
}
window.readFile = readFile;

function showTool(n) {
	if (tool_transition) {
		return;
	}
	tool_transition = true;
	let file_verifier = document.getElementById("file_verifier");
	let gateway_verifier = document.getElementById("gateway_verifier");
	let more_info = document.getElementById("helpful_info");
	let timeout = 499;
	if (firstClick) {
		timeout = 0;
		firstClick = false;
	}
	if (n == 0) {
		setTimeout(function(){file_verifier.classList.add("unhidden");tool_transition = false;}, timeout);
		gateway_verifier.classList.remove("unhidden");
		more_info.classList.remove("unhidden");
	} else if (n == 1) {
		file_verifier.classList.remove("unhidden");
		setTimeout(function(){gateway_verifier.classList.add("unhidden");tool_transition = false;}, timeout);
		more_info.classList.remove("unhidden");
	} else if (n == 2) {
		file_verifier.classList.remove("unhidden");
		gateway_verifier.classList.remove("unhidden");
		setTimeout(function(){more_info.classList.add("unhidden");tool_transition = false;}, timeout);
	}
}
window.showTool = showTool;