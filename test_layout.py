import asyncio
from playwright.async_api import async_playwright
import json

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            viewport={'width': 375, 'height': 667},
            is_mobile=True,
            has_touch=True
        )
        
        await page.goto('http://localhost:3000/login')
        await page.fill('input[type="text"]', 'sysdev')
        await page.fill('input[type="password"]', 'password123')
        await page.click('button[type="submit"]')
        
        await page.wait_for_url('**/admin/dashboard')
        await page.goto('http://localhost:3000/admin/users')
        await page.wait_for_selector('table')
        
        # Give it a second to render fully
        await page.wait_for_timeout(1000)
        
        # Extract widths
        data = await page.evaluate('''() => {
            const docWidth = document.documentElement.clientWidth;
            const scrollWidth = document.documentElement.scrollWidth;
            
            const wideElements = [];
            const allElements = document.querySelectorAll('*');
            
            for (const el of allElements) {
                // Ignore elements that are expected to be exactly 100vw but naturally have a few subpixels, etc.
                if (el.scrollWidth > docWidth && !['HTML', 'BODY', 'MAIN'].includes(el.tagName)) {
                    // Check if it's the table or inside the table
                    const isTableChild = el.closest('table') !== null;
                    if (!isTableChild && el.tagName !== 'TABLE') {
                        wideElements.push({
                            tag: el.tagName,
                            className: el.className,
                            id: el.id,
                            scrollWidth: el.scrollWidth,
                            clientWidth: el.clientWidth
                        });
                    }
                }
            }
            
            return { docWidth, scrollWidth, wideElements };
        }''')
        
        print(json.dumps(data, indent=2))
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
