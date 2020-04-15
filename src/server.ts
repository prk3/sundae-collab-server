import makeApp from './app';

const PORT = Number(process.env.PORT) || 8100;

const [, http] = makeApp();

http.listen(PORT, () => console.info(`Listening on port ${PORT}`));
