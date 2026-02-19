// autoload.js
// যখন Bot চালু হবে, তখনই এই ফাইল সব command load করে দিবে

const fs = require("fs");
const path = require("path");

module.exports = async function autoload() {
  try {
    const cmdDir = path.join(__dirname, "scripts", "cmds"); 
    // GoatBot এর command folder path (প্রয়োজনে বদলাইবা)

    const files = fs.readdirSync(cmdDir).filter(f => f.endsWith(".js"));
    let loaded = 0;

    for (const file of files) {
      const filePath = path.join(cmdDir, file);
      try {
        delete require.cache[require.resolve(filePath)]; // পুরাতন cache clear
        const command = require(filePath);

        if (command?.config?.name) {
          global.GoatBot.commands.set(command.config.name, command);

          if (command.config.aliases?.length) {
            for (const alias of command.config.aliases) {
              global.GoatBot.aliases.set(alias, command.config.name);
            }
          }
          loaded++;
        }
      } catch (err) {
        console.error(`❌ Failed to load ${file}:`, err);
      }
    }

    console.log(`✅ Autoload complete: ${loaded} commands loaded.`);
  } catch (e) {
    console.error("❌ Autoload error:", e);
  }
};
