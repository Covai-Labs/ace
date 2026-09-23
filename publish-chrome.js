import fs from 'fs';
import path from 'path';

const EXTENSION_ID = process.env.CHROME_EXTENSION_ID;
const CLIENT_ID = process.env.CHROME_CLIENT_ID;
const CLIENT_SECRET = process.env.CHROME_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.CHROME_REFRESH_TOKEN;
const ZIP_PATH = process.env.CHROME_ZIP_PATH || 'releases/ai-chat-exporter-chromium.zip';

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

if (!EXTENSION_ID || !CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error(
    'Error: CHROME_EXTENSION_ID, CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, and CHROME_REFRESH_TOKEN environment variables must be set.',
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getAccessToken() {
  console.log('Retrieving Google OAuth2 access token...');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to retrieve access token (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function uploadPackage(accessToken) {
  const actualZipPath = resolveZipPath(ZIP_PATH);
  console.log(`Checking extension package at: ${actualZipPath}`);
  if (!fs.existsSync(actualZipPath)) {
    throw new Error(`Zip package not found at path: ${actualZipPath}`);
  }

  const zipBuffer = fs.readFileSync(actualZipPath);
  console.log(
    `Package read successfully. Size: ${(zipBuffer.length / (1024 * 1024)).toFixed(2)} MB`,
  );

  console.log('Step 1: Uploading package to Chrome Web Store...');
  const uploadUrl = `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}`;
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-api-version': '2',
    },
    body: zipBuffer,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed with status ${response.status}: ${text}`);
  }

  const data = await response.json();
  console.log('Upload response:', data);

  if (data.uploadState === 'SUCCESS') {
    console.log('Package upload succeeded.');
    return;
  }

  if (data.uploadState === 'IN_PROGRESS') {
    console.log('Upload still processing; polling until it reaches SUCCESS...');
    await waitForUploadSuccess(accessToken);
    console.log('Package upload succeeded.');
    return;
  }

  throw new Error(
    `Chrome Web Store upload finished with unexpected state ${JSON.stringify(data.uploadState)}: ${JSON.stringify(data.itemError)}`,
  );
}

async function waitForUploadSuccess(accessToken) {
  const statusUrl = `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}?projection=DRAFT`;
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(10000);
    console.log(`Checking upload status (attempt ${attempt}/${maxAttempts})...`);

    const statusResponse = await fetch(statusUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-goog-api-version': '2',
      },
    });

    if (!statusResponse.ok) {
      const text = await statusResponse.text();
      console.warn(
        `Failed to retrieve upload status (${statusResponse.status}): ${text}. Retrying...`,
      );
      continue;
    }

    const item = await statusResponse.json();
    console.log(`Current upload state: ${item.uploadState}`);

    if (item.uploadState === 'SUCCESS') {
      return;
    }
    if (item.uploadState === 'FAILURE') {
      throw new Error(
        `Chrome Web Store upload reported failure: ${JSON.stringify(item.itemError)}`,
      );
    }
  }

  throw new Error('Timeout: upload did not reach SUCCESS within the polling limit.');
}

async function publishExtension(accessToken) {
  console.log('Step 2: Publishing the uploaded extension...');
  const publishUrl = `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish`;
  const response = await fetch(publishUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-api-version': '2',
      'Content-Length': '0',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Publishing failed with status ${response.status}: ${text}`);
  }

  const data = await response.json();
  console.log('Publish response:', data);

  if (!Array.isArray(data.status) || !data.status.includes('OK')) {
    throw new Error(
      `Chrome Web Store publish not accepted (status: ${JSON.stringify(data.status)}, detail: ${JSON.stringify(data.statusDetail)})`,
    );
  }

  console.log('Extension successfully published/submitted for review.');
}

async function run() {
  const accessToken = await getAccessToken();
  await uploadPackage(accessToken);
  await publishExtension(accessToken);
  console.log('Chrome Web Store upload & publishing flow completed successfully.');
}

run().catch((err) => {
  console.error('Publishing to Chrome Web Store failed:', err);
  process.exit(1);
});
