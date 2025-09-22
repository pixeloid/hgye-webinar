// Test Zoom JWT generation with the official method
import jwt from 'jsonwebtoken';

const SDK_KEY = 'PemnIcUDQoShj6zGj1kpWw';
const SDK_SECRET = 'MUuF6nDVL0xbiLzJmKqHDs8RW0iJc5N3';
const MEETING_NUMBER = '82958583911';

// Generate JWT for Zoom SDK
function generateZoomToken() {
  const iat = Math.round(new Date().getTime() / 1000) - 30;
  const exp = iat + 60 * 60 * 2; // 2 hours

  const payload = {
    iss: SDK_KEY,
    exp: exp,
    iat: iat,
    aud: 'zoom',
    appKey: SDK_KEY,
    tokenExp: exp,
    alg: 'HS256'
  };

  const token = jwt.sign(payload, SDK_SECRET, { algorithm: 'HS256' });

  console.log('🔑 Generated Zoom JWT Token:');
  console.log('SDK Key:', SDK_KEY);
  console.log('Meeting Number:', MEETING_NUMBER);
  console.log('Token:', token);
  console.log('Token length:', token.length);

  // Verify the token
  try {
    const decoded = jwt.verify(token, SDK_SECRET);
    console.log('✅ Token verification successful');
    console.log('Decoded payload:', decoded);
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
  }

  return {
    signature: token,
    sdkKey: SDK_KEY,
    meetingNumber: MEETING_NUMBER,
    userName: 'Test User',
    userEmail: 'test@example.com',
    passWord: ''
  };
}

// Test HTML page generation
function generateTestHTML(credentials) {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Zoom SDK Test</title>
    <link type="text/css" rel="stylesheet" href="https://source.zoom.us/3.9.0/css/bootstrap.css" />
    <link type="text/css" rel="stylesheet" href="https://source.zoom.us/3.9.0/css/react-select.css" />
</head>
<body>
    <div id="meetingSDKElement"></div>

    <script src="https://source.zoom.us/3.9.0/lib/vendor/react.min.js"></script>
    <script src="https://source.zoom.us/3.9.0/lib/vendor/react-dom.min.js"></script>
    <script src="https://source.zoom.us/3.9.0/lib/vendor/redux.min.js"></script>
    <script src="https://source.zoom.us/3.9.0/lib/vendor/redux-thunk.min.js"></script>
    <script src="https://source.zoom.us/3.9.0/lib/vendor/lodash.min.js"></script>
    <script src="https://source.zoom.us/zoom-meeting-3.9.0.min.js"></script>

    <script>
        ZoomMtg.setZoomJSLib('https://source.zoom.us/3.9.0/lib', '/av');
        ZoomMtg.preLoadWasm();
        ZoomMtg.prepareWebSDK();

        const meetingConfig = ${JSON.stringify(credentials, null, 2)};

        console.log('Meeting config:', meetingConfig);

        ZoomMtg.init({
            leaveUrl: 'http://localhost:3001',
            isSupportAV: true,
            success: function() {
                console.log('Zoom init success');

                ZoomMtg.join({
                    signature: meetingConfig.signature,
                    sdkKey: meetingConfig.sdkKey,
                    meetingNumber: meetingConfig.meetingNumber,
                    userName: meetingConfig.userName,
                    userEmail: meetingConfig.userEmail,
                    passWord: meetingConfig.passWord,
                    success: function(res) {
                        console.log('Zoom join success', res);
                    },
                    error: function(res) {
                        console.log('Zoom join error', res);
                    }
                });
            },
            error: function(res) {
                console.log('Zoom init error', res);
            }
        });
    </script>
</body>
</html>
  `;

  return html;
}

// Generate token and test HTML
const credentials = generateZoomToken();
const testHTML = generateTestHTML(credentials);

// Save test HTML file
import fs from 'fs';
fs.writeFileSync('zoom-test.html', testHTML);

console.log('\n📄 Test HTML file created: zoom-test.html');
console.log('Open this file in your browser to test the Zoom SDK directly');
console.log('\n💡 If this works, the issue is in our Edge Function JWT generation');
console.log('💡 If this fails too, the issue is with the Zoom SDK credentials or meeting ID');