import { bootstrapApplication, provideClientHydration,withEventReplay } from '@angular/platform-browser';
import { mergeApplicationConfig } from '@angular/core';
import { App } from './app';
import { appConfig } from './app.config';
bootstrapApplication(App,mergeApplicationConfig(appConfig,{providers:[provideClientHydration(withEventReplay())]})).catch(error=>console.error(error));
