const fs = require('fs');
const http = require('http');
const path = require('path');

const filePath = path.join(__dirname, 'sample.pdf');
const boundary = '----boundary123';
const header = `--${boundary}\r\nContent-Disposition: form-data; name="resume"; filename="sample.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
const footer = `\r\n--${boundary}--\r\n`;

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/upload',
    method: 'POST',
    headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
    }
};

console.log('sending upload request to http://localhost:5000/upload');

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
        console.log(data);
    });
});

req.on('error', (err) => {
    console.error(err);
    process.exit(1);
});

req.write(header);
req.write(fs.readFileSync(filePath));
req.write(footer);
req.end();
