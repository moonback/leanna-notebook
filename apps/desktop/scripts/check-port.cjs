const net = require("node:net");

const host = "127.0.0.1";
const port = 3000;
const server = net.createServer();

server.once("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    process.stderr.write(
      `\nLe port ${port} est déjà utilisé sur ${host}.\nFermez le serveur qui l'occupe, puis relancez pnpm desktop:dev.\n\n`,
    );
  } else {
    process.stderr.write(`Impossible de vérifier le port ${port}: ${error.message}\n`);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  server.close((error) => {
    if (error) {
      process.stderr.write(`Impossible de libérer le port de vérification: ${error.message}\n`);
      process.exitCode = 1;
    }
  });
});
