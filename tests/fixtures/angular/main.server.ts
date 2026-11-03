import { BootstrapContext,bootstrapApplication,provideClientHydration,withEventReplay } from '@angular/platform-browser';
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering,withRoutes,RenderMode } from '@angular/ssr';
import { App } from './app';
import { appConfig } from './app.config';
const config=mergeApplicationConfig(appConfig,{providers:[provideClientHydration(withEventReplay()),provideServerRendering(withRoutes([{path:'**',renderMode:RenderMode.Server}]))]});
export default (context:BootstrapContext)=>bootstrapApplication(App,config,context);
