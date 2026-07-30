const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new'
  });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 375, height: 667, isMobile: true });
  await page.goto('http://localhost:3000/login');
  await page.type('input[type="text"]', 'sysdev');
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
  await page.goto('http://localhost:3000/admin/users');
  await page.waitForSelector('table');
  
  const layoutIssues = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    
    const elements = Array.from(document.querySelectorAll('*'));
    const wideElements = elements
      .filter(el => el.scrollWidth > docWidth && el.tagName !== 'HTML' && el.tagName !== 'BODY' && el.tagName !== 'TR' && el.tagName !== 'TD' && el.tagName !== 'TH' && el.tagName !== 'TBODY' && el.tagName !== 'THEAD' && el.tagName !== 'TABLE')
      .map(el => ({
        tag: el.tagName,
        className: el.className,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        offsetWidth: el.offsetWidth,
        id: el.id
      }));
      
    return { docWidth, scrollWidth, wideElements };
  });
  
  console.log("LAYOUT ANALYSIS:");
  console.log(JSON.stringify(layoutIssues, null, 2));
  
  await browser.close();
})();
