const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const vm = require('vm');
const progress = require('progress');

// 远程文件 URL
const remoteFileUrl = 'https://testingcf.jsdelivr.net/gh/nj-lizhi/song@master/audio/list-v2.js';  // 替换为实际的远程文件URL
const logFilePath = path.join(__dirname,'downloading.log');
// 下载文件函数
async function downloadFile(url, outputPath) {
	const fileSize = checkFileSize(outputPath)
	if (fs.existsSync(outputPath) && fileSize >0){
		console.log(`File already exists: ${outputPath}`)
		return;
	}
	const writer = fs.createWriteStream(outputPath);

	const response = await axios({
		url,
		method: 'GET',
		responseType: 'stream'
	});
	const totalLength = response.headers['content-length'];
	console.log(`starting download of ${url} to ${outputPath}`);

	const progressBar = new progress('-> downloading [:bar] :percent :etas',{
		width:40,
		complete:'=',
		imcomplete: ' ',
		renderThrottle: 16,
		total:parseInt(totalLength)
	});


	response.data.on('data',(chunk) => progressBar.tick(chunk.length));
	response.data.pipe(writer);

	return new Promise((resolve, reject) => {
		writer.on('finish', resolve);
		writer.on('error', reject);
	});
}

async function checkFileSize(filePath){
	try{
		const stats =await fs.stat(filePath);
		return stats.size;
	}catch(error){
		return -1;// 文件不存在
	}
}

// 从远程文件获取列表
async function fetchList() {
	try {
		const response = await axios.get(remoteFileUrl);
		const scriptContent = response.data;

		const sandbox = { list: [] };
		const script = new vm.Script(scriptContent);
		const context = new vm.createContext(sandbox);
		script.runInContext(context);

		return sandbox.list;
	} catch (error) {
		console.error('Error fetching list:', error);
		return [];
	}
}

// 记录日志
async function logDownload(item, type) {
	const logData = `${new Date().toISOString()} - ${type} - ${item.artist} - ${item.name}\n`;
	await fs.appendFile(logFilePath, logData);
}


// 读取日志
async function readLog() {
	try {
		const data = await fs.readFile(logFilePath, 'utf-8');
		const lines = data.split('\n').filter(line => line.length > 0);
		return new Set(lines.map(line => {
			const [, , artist, name] = line.split(' - ');
			return `${artist}-${name}`;
		}));
	} catch (error) {
		return new Set();
	}
}

// 主函数
async function downloadSongs() {
	const completeDownloads = await readLog();
	const list = await fetchList();

	for (const item of list) {
		const albumPath = path.join(__dirname, item.artist);
		const songPath = path.join(albumPath, `${item.name}.mp3`);
		const coverPath = path.join(albumPath, 'cover.png');

		// 确保目录存在
		await fs.ensureDir(albumPath);

		// 下载歌曲
		try {
			console.log(`Downloading song: ${item.name}`);
			await downloadFile(item.url, songPath);
			await logDownload(item, 'song')
			console.log(`Downloaded song: ${item.name}`);
		} catch (error) {
			console.error(`Error downloading song: ${item.name}`, error);
		}

		// 下载封面
		try {
			console.log(`Downloading cover for: ${item.artist}`);
			await downloadFile(item.cover, coverPath);
			await logDownload(item, 'cover')
			console.log(`Downloaded cover for: ${item.artist}`);
		} catch (error) {
			console.error(`Error downloading cover for: ${item.artist}`, error);
		}
	}
}
// 主函数
async function asyncDownloadSongs() {
	const completedDownloads = await readLog();
	const list = await fetchList();

	const downloadPromises = list.map(async (item) => {
		const identifier = `${item.artist}-${item.name}`;
		if (completedDownloads.has(identifier)) {
			console.log(`Already downloaded: ${identifier}`);
			return;
		}

		const albumPath = path.join(__dirname, item.artist);
		const songPath = path.join(albumPath, `${item.name}.mp3`);
		const coverPath = path.join(albumPath, 'cover.png');

		await fs.ensureDir(albumPath);

		try {
			console.log(`Downloading song: ${item.name}`);
			await downloadFile(item.url, songPath);
			await logDownload(item, 'song');
			console.log(`Downloaded song: ${item.name}`);
		} catch (error) {
			console.error(`Error downloading song: ${item.name}`, error);
		}

		try {
			console.log(`Downloading cover for: ${item.artist}`);
			await downloadFile(item.cover, coverPath);
			await logDownload(item, 'cover');
			console.log(`Downloaded cover for: ${item.artist}`);
		} catch (error) {
			console.error(`Error downloading cover for: ${item.artist}`, error);
		}
	});

	await Promise.all(downloadPromises);
}

downloadSongs().then(() => {
	console.log('All downloads completed.');
}).catch(error => {
	console.error('Error downloading songs:', error);
});

