import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 344, "height": 882})
        await page.goto("http://localhost:3000/login")
        await page.fill("input[type='text']", "sysdev")
        await page.fill("input[type='password']", "password123")
        await page.click("button[type='submit']")
        await page.wait_for_url("**/admin/dashboard")
        await page.goto("http://localhost:3000/admin/users")
        await page.wait_for_selector("table")
        
        # Check widths
        client_width = await page.evaluate("document.documentElement.clientWidth")
        scroll_width = await page.evaluate("document.documentElement.scrollWidth")
        body_scroll_width = await page.evaluate("document.body.scrollWidth")
        
        print(f"client_width: {client_width}")
        print(f"documentElement.scrollWidth: {scroll_width}")
        print(f"body.scrollWidth: {body_scroll_width}")
        
        # Get all elements wider than client_width
        widest = await page.evaluate("""() => {
            const clientWidth = document.documentElement.clientWidth;
            let res = [];
            document.querySelectorAll('*').forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width > clientWidth || rect.right > clientWidth) {
                    res.push({
                        tag: el.tagName,
                        className: el.className,
                        width: rect.width,
                        right: rect.right
                    });
                }
            });
            return res;
        }""")
        
        print("Elements wider than screen:")
        for w in widest:
            print(f"- {w['tag']}.{w['className']}: w={w['width']}, r={w['right']}")
            
        await page.screenshot(path="screenshot.png")
        await browser.close()

asyncio.run(main())
