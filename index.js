const puppeteer = require('puppeteer');
const moment = require('moment');
const fetch = require('node-fetch');
const {
    URLSearchParams
} = require('url');
const fs = require('fs');


const user = {
    name: "406410003",
    password: "a123456"
};
const unit = "單位名稱";
const year = 109;
const month = 3;
const hours = 24;
let curHours = 0;
const workName = "工作內容";

const time = [8, 13, 18];
let lastDay = 31;
(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        slowMo: 100
    });
    const page = await browser.newPage();
    await page.goto('https://miswww1.ccu.edu.tw/parttime/index.php');
    await page.type('input[name="staff_cd"]', user.name);
    await page.type('input[name="passwd"]', user.password);
    await page.click('input[type="submit"]');
    await page.goto('https://miswww1.ccu.edu.tw/parttime/control2.php')

    await storeHours(page);
    const params = await getParams(browser, page, {
        lastDay,
        year,
        month,
        day: lastDay,
        workName,
    });
    setTimeout(await getPdf(params),5000)
    // await browser.close();
})();
async function getPdf(data) {
    const params = new URLSearchParams();
    params.append('sid', data.sid);
    params.append('bsn', data.bsn);
    params.append('ctrow', data.ctrow);
    params.append('emp_type', data.emp_type);
    params.append('go_check', data.go_check);
    const response = await fetch(`https://miswww1.ccu.edu.tw/parttime/printpdf1.php`, {
        method: 'POST',
        body: params,
        headers: {
            cookie: `PHPSESSID=${data.PHPSESSID}`
        }
    })
    const result = await response.arrayBuffer()
    fs.writeFileSync(`${workName}.pdf`, new Buffer.from(result));

}
async function getParams(browser, page, data) {
    await page.goto('https://miswww1.ccu.edu.tw/parttime/print_sel.php')
    // view of type hours
    const options = await page.$$eval('option', options => options.map((option) => {
        return {
            text: option.textContent,
            value: option.value
        }
    }));
    const optionValue = options.filter(o => o.text == unit)[0].value;
    await page.select('select[name="unit_cd1"]', optionValue)
    await page.$eval('input[name="sy"]', (y, year) => y.value = year, data.year);
    await page.$eval('input[name="sm"]', (m, month) => m.value = month, data.month);
    await page.$eval('input[name="sd"]', (d) => d.value = 1);
    await page.$eval('input[name="ey"]', (y, year) => y.value = year, data.year);
    await page.$eval('input[name="em"]', (m, month) => m.value = month, data.month);
    await page.$eval('input[name="ed"]', (d, day) => d.value = day, data.lastDay);
    await page.click('input[type="submit"]');
    const table1Td = await page.$$("table[align='BOTTOM'] td")
    const td = table1Td.filter((td, i) => {
        return i % 7 == 0 || (i - 6) % 7 == 0;
    })
    const items = [];
    for (let i = 0; i < td.length / 2 > 0; ++i) {
        items.push({
            check: await td[i * 2].$('input'),
            workName: await page.evaluate((_target) => _target.textContent, td[i * 2 + 1])
        })
    }
    items.forEach(async (item) => {
        if (item.workName == data.workName) {
            item.check.click();
        }
    })
    await page.click('input[value="1"][name="sutype"]');
    await page.click('input[value="0"][name="iswork"]');
    await page.click('input[value="1"][name="emp_type"]');
    await page.click('input[name="agreethis"]');
    await page.click('input[type="submit"]');

    const sid = await page.$eval('input[name="sid"]', (e) => e.value)
    const bsn = await page.$eval('input[name="bsn"]', (e) => e.value)
    const ctrow = await page.$eval('input[name="ctrow"]', (e) => e.value)
    const emp_type = await page.$eval('input[name="emp_type"]', (e) => e.value)
    const go_check = await page.$eval('input[name="go_check"]', (e) => e.value)
    const cookies = await page.cookies()
    const PHPSESSID = cookies
        .filter((e) => e.name == "PHPSESSID")
        .map((e) => e.value)

    return {
        sid,
        bsn,
        ctrow,
        emp_type,
        go_check,
        cookies,
        PHPSESSID,
    }
}
async function storeHours(page) {
    const main = await page.frames()[2];
    const xa = await page.frames()[1];

    // view of type hours
    const options = await main.$$eval('option', options => options.map((option) => {
        return {
            text: option.textContent.slice(0, -1),
            value: option.value
        }
    }));
    const optionValue = options.filter(o => o.text == unit)[0].value;

    // for (let day = ; day <= 31; ++day) {
    while (curHours < hours) {
        const day = getRandomInt(31);
        const date = moment(`${year+1911}-${month}-${day}`, "YYYY-MM-DD")
        if (date.isValid()) {
            weekDay = moment(date).format('e')
            // judge is weekend
            if (weekDay > 0 && weekDay < 6) {
                lastDay = moment(date).format('D');
                hour = 4
                if (hours - curHours < 4) {
                    hour = hours - curHours;
                }
                // for (let t = 0; t < time.length; ++t) {
                // const from = time[t];
                const from = time[getRandomInt(3) - 1]
                const to = from + hour;
                try {
                    await typeContent({
                        main,
                        xa
                    }, {
                        year,
                        month,
                        day,
                        workName,
                        from,
                        to,
                        optionValue
                    });
                    await main.click('input[type="submit"]');
                    await main.waitFor(500)
                    const list = await xa.$$eval('td', nodes => nodes.map(node => node.textContent))
                    if (list && list.length != 1) {
                        curHours = list.filter((l, i) => (i + 2) % 5 == 0)
                            .reduce((acc, cur) => acc + parseInt(cur), 0)
                    }
                    console.log(`目前填入時數: ${curHours} hr`);
                    if (curHours == hours) {
                        await main.click('input[value="完成並儲存至資料庫"]')
                        console.log("Type finish");
                        return;
                    }    
                } catch (error) {
                    console.error(error)
                }
            }
        }
    }
    console.log("Type finish");
}
async function typeContent({
    main,
    xa
}, data) {
    return new Promise(async function (resolve, reject) {
        try {
            await main.$eval('input[name="yy"]', (y, year) => y.value = year, data.year);
            await main.$eval('input[name="mm"]', (m, month) => m.value = month, data.month);
            await main.$eval('input[name="dd"]', (d, day) => d.value = day, data.day);
            await main.$eval('input[name="workin"]', (w, workName) => w.value = workName, data.workName);
            await main.$eval('input[name="shour"]', (w, from) => w.value = from, data.from);
            await main.$eval('input[name="ehour"]', (w, to) => w.value = to, data.to);
            await main.select('select[name="type"]', data.optionValue)
            resolve();
        } catch (error) {
            reject(error)
        }
    });
}

function getRandomInt(max) {
    return Math.ceil(Math.random() * Math.floor(max));
}