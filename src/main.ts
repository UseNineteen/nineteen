import { mount } from 'svelte';
import { capturePristineHtml } from './lib/standalone';
import App from './App.svelte';
import './styles/app.css';

capturePristineHtml();

mount(App, { target: document.getElementById('main')! });
