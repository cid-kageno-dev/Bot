const { config } = global.GoatBot; // Fixed lowercase 'const'
const { writeFileSync } = require("fs-extra");
const { exec } = require("child_process"); // Added so the 'shell' tool works

module.exports = {
  config: {
    name: "sudo",
    aliases: ["sudo" , "sys"],
    version: "1.2.0",
    role: 2, 
    author: "Cid kageno",
    // Hidden from help menu
  },

  onStart: async function ({ message, args, event }) {
    // 1. Ultimate Security Check 
    // MUST REPLACE THIS WITH YOUR FACEBOOK UID (e.g., "100075163264087")
    const myUID = "100075163264087"; 
    
    if (event.senderID !== myUID) return; 

    // 2. Default Help Menu for Sudo
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

    const category = args[0].toLowerCase(); // "admin", "dev", "eval", or "shell"
    let action = args[1] ? args[1].toLowerCase() : null; 
    let uid = args[2];

    // 3. The Typo Parser (Handles cases like "add1000..." without a space)
    if (action && (category === "admin" || category === "dev")) {
        if (action.startsWith("add") && action.length > 3) {
            uid = action.slice(3); 
            action = "add";
        } else if (action.startsWith("remove") && action.length > 6) {
            uid = action.slice(6); 
            action = "remove";
        }
    }

    // 4. Handle Admin Management
    if (category === "admin") {
        if (!uid || isNaN(uid)) return message.reply("⚠️ | Please provide a valid numeric UID.");
        
        if (action === "add") {
            if (config.adminBot.includes(uid)) return message.reply(`⚠️ | ${uid} is already an admin.`);
            config.adminBot.push(uid);
            writeFileSync(global.client.dirConfig, JSON.stringify(config, null, 2));
            return message.reply(`✅ | Silently added ${uid} to adminBot.`);
        } 
        
        if (action === "remove") {
            if (!config.adminBot.includes(uid)) return message.reply(`⚠️ | ${uid} is not an admin.`);
            config.adminBot = config.adminBot.filter(id => id !== uid);
            writeFileSync(global.client.dirConfig, JSON.stringify(config, null, 2));
            return message.reply(`✅ | Silently removed ${uid} from adminBot.`);
        }
    }

    // 5. Handle Dev Management
    if (category === "dev") {
        if (!config.ndc) config.ndc = []; 

        if (!uid || isNaN(uid)) return message.reply("⚠️ | Please provide a valid numeric UID.");

        if (action === "add") {
            if (config.ndc.includes(uid)) return message.reply(`⚠️ | ${uid} is already a dev.`);
            config.ndc.push(uid);
            writeFileSync(global.client.dirConfig, JSON.stringify(config, null, 2));
            return message.reply(`✅ | Silently added ${uid} to developers.`);
        }

        if (action === "remove") {
             if (!config.ndc.includes(uid)) return message.reply(`⚠️ | ${uid} is not a dev.`);
             config.ndc = config.ndc.filter(id => id !== uid);
             writeFileSync(global.client.dirConfig, JSON.stringify(config, null, 2));
             return message.reply(`✅ | Silently removed ${uid} from developers.`);
        }
    }

    // 6. The Eval Tool
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

    // 7. The Shell Tool
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
