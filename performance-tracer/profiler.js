const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function capturePerformanceProfile(url, outputPath, recordDurationSecs = 5, screenshotInterval = 1) {
    let browser;
    try {
        // Launch browser with CDP support
        browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // Create new page and CDP client
        const page = await browser.newPage();
        const client = await page.target().createCDPSession();

        // Set viewport size for consistent screenshots
        await page.setViewport({ width: 1024, height: 768 });

        // Start CPU and Memory profilers
        await client.send('Profiler.enable');
        await client.send('HeapProfiler.enable');
        
        // Set up profiler
        await client.send('Profiler.setSamplingInterval', { interval: 100 });
        
        // Start profiling
        await client.send('Profiler.start');
        
        // Navigate to the URL
        await page.goto(url, { waitUntil: 'networkidle0' });

        // Create output directory if it doesn't exist
        const dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });

        // Create screenshots directory
        const screenshotsDir = path.join(path.dirname(outputPath), 'screenshots');
        await fs.mkdir(screenshotsDir, { recursive: true });

        // Start screenshot capture loop
        console.log(`Recording performance profile for ${recordDurationSecs} seconds...`);
        const startTime = Date.now();
        const screenshotPromises = [];
        
        while (Date.now() - startTime < recordDurationSecs * 1000) {
            const timestamp = Date.now() - startTime;
            const screenshotPath = path.join(
                path.join(path.dirname(outputPath), 'screenshots'),
                `screenshot-${timestamp}ms.png`
            );
            
            const screenshotPromise = page.screenshot({
                path: screenshotPath,
                fullPage: true
            }).then(() => {
                console.log(`Screenshot saved: ${screenshotPath}`);
            });
            
            screenshotPromises.push(screenshotPromise);
            
            // Wait for screenshot interval
            await new Promise(resolve => 
                setTimeout(resolve, screenshotInterval * 1000)
            );
        }

        // Wait for all screenshots to complete
        await Promise.all(screenshotPromises);
        
        // Stop profiling and get the results
        const profile = await client.send('Profiler.stop');
        
        // Save the profile
        await fs.writeFile(
            outputPath,
            JSON.stringify(profile.profile, null, 2)
        );
        
        console.log(`Performance profile saved to: ${outputPath}`);
        
        // Capture memory snapshot
        const heapSnapshot = await client.send('HeapProfiler.takeHeapSnapshot', {
            reportProgress: false
        });
        
        const memoryOutputPath = outputPath.replace('.cpuprofile', '.heapsnapshot');
        await fs.writeFile(
            memoryOutputPath,
            JSON.stringify(heapSnapshot, null, 2)
        );
        
        console.log(`Memory snapshot saved to: ${memoryOutputPath}`);
        console.log(`Screenshots saved in: ${screenshotsDir}`);

    } catch (error) {
        console.error('Error during profiling:', error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: node profiler.js <url> <output-path> [duration-seconds] [screenshot-interval-seconds]');
        process.exit(1);
    }

    const [url, outputPath, duration, screenshotInterval] = args;
    
    capturePerformanceProfile(url, outputPath, duration || 5, screenshotInterval || 1)
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = capturePerformanceProfile;
