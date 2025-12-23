import puppeteer from 'puppeteer';

async function inspectOptions() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://fs1.formsite.com/res/showFormEmbed?EParam=B6fiTn-RcO5Oi8C4iSTjsq4WXqv4L_Qk&748593425&EmbedId=748593425', { waitUntil: 'networkidle0' });

    const options = await page.evaluate(() => {
        const select = document.querySelector('#RESULT_RadioButton-13');
        if (!select) return 'Select element not found';
        return Array.from(select.options).map(opt => ({ text: opt.text, value: opt.value }));
    });

    console.log(JSON.stringify(options, null, 2));
    await browser.close();
}

inspectOptions();
