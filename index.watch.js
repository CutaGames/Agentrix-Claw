import { registerRootComponent } from 'expo';
import WatchApp from './src/watch/WatchApp';

// Wear OS entry point — registers WatchApp instead of the phone App
registerRootComponent(WatchApp);
