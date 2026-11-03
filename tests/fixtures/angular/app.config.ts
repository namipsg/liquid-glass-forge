import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Fixture,Away } from './app';
export const appConfig:ApplicationConfig={providers:[provideZonelessChangeDetection(),provideRouter([{path:'',component:Fixture},{path:'away',component:Away}])]};
