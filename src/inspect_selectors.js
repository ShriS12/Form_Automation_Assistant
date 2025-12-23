import puppeteer from 'puppeteer';

async function inspect() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://fs1.formsite.com/res/showFormEmbed?EParam=B6fiTn-RcO5Oi8C4iSTjsq4WXqv4L_Qk&748593425&EmbedId=748593425', { waitUntil: 'networkidle0' });

    const fields = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
        return inputs.map(input => {
            let labelText = '';
            if (input.id) {
                const label = document.querySelector(`label[for="${input.id}"]`);
                if (label) labelText = label.innerText.trim();
            }
            return {
                tagName: input.tagName,
                type: input.type,
                id: input.id,
                name: input.name,
                label: labelText,
                placeholder: input.placeholder
            };
        });
    });

    const simplified = fields.map(f => `ID: ${f.id} | Name: ${f.name} | Label: ${f.label}`).join('\n');
    const fs = await import('fs');
    fs.writeFileSync('selectors.txt', simplified);
    await browser.close();
}

inspect();
