const builder = require('electron-builder');
const Platform = builder.Platform;

async function build() {
  try {
    await builder.build({
      targets: Platform.WINDOWS.createTarget(),
      config: {
        win: {
          target: 'nsis',
        },
      },
    });
    console.log('Windows build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
  }
}

build(); 