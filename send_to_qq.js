const QMSG_KEY = '4cce80a5553fcb7cabf1dd321d62b4181cd2dc01';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sendMsg(text) {
  const params = new URLSearchParams();
  params.append('msg', text);
  const res = await fetch('https://qmsg.zendee.cn/v3/send/' + QMSG_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  return await res.json();
}

async function run() {
  const msg1 = `【Antigravity 智能预测器 v1.3.0 更新亮点 (1/2)】
老板好！你的专属打字小秘书已全面升级，这次重点用大白话给你汇报：

1. 说话带自然标点了：
以前字挨着字不喘气，现在逗号、句号、问号自然带上，读起来很舒服。比如输入“帮我排查这段代码”，后面自然跟着“中的语法错误，并给出修复建议。”

2. 彻底不跟你抬杠反问了：
以前输入“你看看我下载的插件哪些能删”，它反问“请先发列表”。这次彻底清除了它的旧坏习惯，现在它清楚自己是站在你的角度帮你把话说完，续写变成“，并说明删除后对功能的影响。”，按 Tab 一键收下！

3. 右边打字不玩失踪：
修复了侧边栏打字快到右边框时提示文字被隐藏的 Bug。现在右边放不下会自动换到下一行开头展示，怎么打字都不会消失！`;

  const msg2 = `【Antigravity 智能预测器 v1.3.0 更新亮点 (2/2)】

4. Alt + ] 可以挑选项：
后台一次准备了 2 到 3 个下半句。提示字旁有 (1/3) 标记，按 Alt + ] 切换下一条，挑中满意的按 Tab 采纳。

5. 懂你在看什么文件：
打开网页 HTML 文件输入“优化”，它会自动提示网页自适应布局；打开 Python 就会提示 Python 专属代码。

6. 自带体检医生 (Doctor)：
按 Ctrl+Shift+P 运行 Doctor 诊断，官方升级哪怕把补丁冲了，点一下就能自动重新修复，不用担心更新搞坏。

7. 隐私安全保护：
密码、API密钥、局域网IP在发给云端前会在本地自动打码遮蔽（如 192.168.*.*），杜绝外泄。

【生效方法】
在 VS Code 中按 Ctrl+Shift+P，输入并回车 Reload Window (重载窗口) 即可立即使用！`;

  console.log('Sending Part 1...');
  const r1 = await sendMsg(msg1);
  console.log('Part 1 Result:', r1);

  console.log('Waiting 3.5s for rate limit...');
  await sleep(3500);

  console.log('Sending Part 2...');
  const r2 = await sendMsg(msg2);
  console.log('Part 2 Result:', r2);
}

run();
