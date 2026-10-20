import config from '../../eslint.config.mjs';
export default [...config, {...config[1], files: ['scripts/t14/*.mjs']}];
