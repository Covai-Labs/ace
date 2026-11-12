import fs from 'fs';
import path from 'path';

const PRODUCT_ID = process.env.EDGE_PRODUCT_ID;
const CLIENT_ID = process.env.EDGE_CLIENT_ID;
const API_KEY = process.env.EDGE_API_KEY;
const ZIP_PATH = process.env.EDGE_ZIP_PATH || 'releases/ai-chat-exporter-chromium.zip';

function resolveZipPath(pattern) {
  if (fs.existsSync(pattern)) return pattern;
  const dir = path.dirname(pattern);
  const filenamePattern = path.basename(pattern);
  if (filenamePattern.includes('*') && fs.existsSync(dir)) {
    const regex = new RegExp('^' + filenamePattern.replace(/\*/g, '.*') + '$');
    const files = fs.readdirSync(dir);
    const match = files.find((file) => regex.test(file));
    if (match) {
      return path.join(dir, match);
    }
  }
  return pattern;
}

if (!PRODUCT_ID || !CLIENT_ID || !API_KEY) {
  console.error(
    'Error: EDGE_PRODUCT_ID, EDGE_CLIENT_ID, and EDGE_API_KEY environment variables must be set.',
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function publish() {
  const actualZipPath = resolveZipPath(ZIP_PATH);
  console.log(`Checking extension package at: ${actualZipPath}`);
  if (!fs.existsSync(actualZipPath)) {
    throw new Error(`Zip package not found at path: ${actualZipPath}`);
  }

  const zipBuffer = fs.readFileSync(actualZipPath);
  console.log(
    `Package read successfully. Size: ${(zipBuffer.length / (1024 * 1024)).toFixed(2)} MB`,
  );

  const headers = {
    Authorization: `ApiKey ${API_KEY}`,
    'X-ClientID': CLIENT_ID,
  };

  console.log('Step 1: Uploading package to Microsoft Edge Add-ons...');
  const uploadUrl = `https://api.addons.microsoftedge.microsoft.com/v1/products/${PRODUCT_ID}/submissions/draft/package`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/zip',
    },
    body: zipBuffer,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Upload failed with status ${uploadResponse.status}: ${text}`);
  }

  const uploadLocation = uploadResponse.headers.get('Location');
  if (!uploadLocation) {
    throw new Error('Upload succeeded but no Location header was returned.');
  }

  // Location is typically in the format: /v1/products/.../operations/<operationId>
  const uploadOperationId = uploadLocation.split('/').pop() || uploadLocation;
  console.log(`Upload initiated. Operation ID: ${uploadOperationId}`);

  // Step 2: Poll upload operation status
  const uploadStatusUrl = `https://api.addons.microsoftedge.microsoft.com/v1/products/${PRODUCT_ID}/submissions/draft/package/operations/${uploadOperationId}`;
  let uploadStatus = 'InProgress';
  const maxRetries = 30;
  let attempt = 0;

  console.log('Step 2: Polling upload status...');
  while (uploadStatus === 'InProgress') {
    attempt++;
    if (attempt > maxRetries) {
      throw new Error('Timeout: Upload status polling exceeded maximum limit.');
    }

    await sleep(10000); // Poll every 10 seconds
    console.log(`Checking upload status (attempt ${attempt}/${maxRetries})...`);

    const statusResponse = await fetch(uploadStatusUrl, {
      method: 'GET',
      headers,
    });

    if (!statusResponse.ok) {
      const text = await statusResponse.text();
      console.warn(
        `Failed to retrieve upload status (${statusResponse.status}): ${text}. Retrying...`,
      );
      continue;
    }

    const data = await statusResponse.json();
    uploadStatus = data.status;
    console.log(`Current upload status: ${uploadStatus}`);

    if (uploadStatus === 'Failed') {
      throw new Error(`Upload operation failed: ${JSON.stringify(data)}`);
    }
  }

  if (uploadStatus !== 'Succeeded') {
    throw new Error(`Upload finished with unexpected status: ${uploadStatus}`);
  }
  console.log('Package upload succeeded and processed.');

  // Step 3: Publish the submission
  console.log('Step 3: Submitting the draft to store for review...');
  const publishUrl = `https://api.addons.microsoftedge.microsoft.com/v1/products/${PRODUCT_ID}/submissions`;
  const publishResponse = await fetch(publishUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes: 'Automated submission via GitHub Actions CI/CD pipeline.' }),
  });

  if (!publishResponse.ok) {
    const text = await publishResponse.text();
    throw new Error(`Publish request failed with status ${publishResponse.status}: ${text}`);
  }

  const publishLocation = publishResponse.headers.get('Location');
  if (!publishLocation) {
    throw new Error('Publish request succeeded but no Location header was returned.');
  }

  const publishOperationId = publishLocation.split('/').pop() || publishLocation;
  console.log(`Publish request initiated. Operation ID: ${publishOperationId}`);

  // Step 4: Poll publishing operation status
  const publishStatusUrl = `https://api.addons.microsoftedge.microsoft.com/v1/products/${PRODUCT_ID}/submissions/operations/${publishOperationId}`;
  let publishStatus = 'InProgress';
  attempt = 0;

  console.log('Step 4: Polling publishing status...');
  while (publishStatus === 'InProgress') {
    attempt++;
    if (attempt > maxRetries) {
      throw new Error('Timeout: Publishing status polling exceeded maximum limit.');
    }

    await sleep(10000); // Poll every 10 seconds
    console.log(`Checking publish status (attempt ${attempt}/${maxRetries})...`);

    const statusResponse = await fetch(publishStatusUrl, {
      method: 'GET',
      headers,
    });

    if (!statusResponse.ok) {
      const text = await statusResponse.text();
      console.warn(
        `Failed to retrieve publish status (${statusResponse.status}): ${text}. Retrying...`,
      );
      continue;
    }

    const data = await statusResponse.json();
    publishStatus = data.status;
    console.log(`Current publish status: ${publishStatus}`);

    if (publishStatus === 'Failed') {
      throw new Error(`Publishing submission failed: ${JSON.stringify(data)}`);
    }
  }

  console.log(`Publishing workflow completed successfully with status: ${publishStatus}`);
}

publish().catch((err) => {
  console.error('Publishing to Edge Add-ons failed:', err);
  process.exit(1);
});
