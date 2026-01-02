import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base';
import dmxnet_pkg from 'dmxnet';

process.on('uncaughtException', (err) => {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('UNCAUGHT EXCEPTION:', err.message);
    console.error(err.stack);
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('UNHANDLED REJECTION:', reason);
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
});

console.log('ART-NET MODULE LOADING...');

const dmxnet = dmxnet_pkg.dmxnet || dmxnet_pkg;

class ArtNetFixtureInstance extends InstanceBase {
    constructor(internal) {
        super(internal);
        this.dmxnet = null;
        this.sender = null;
        this.fixtures = [];
        this.templates = {};
        this.presets = [];
        this.dmxData = Buffer.alloc(512);
        this.config = {};
    }

    async init(config) {
        this.log('debug', 'Initializing Art-Net Fixture Module...');
        try {
            this.config = config || {};
            this.updateStatus(InstanceStatus.Connecting);

            this.log('debug', 'Step 1: Init Art-Net');
            this.initArtNet();

            this.log('debug', 'Step 2: Process Config');
            this.processConfig();

            this.log('debug', 'Step 3: Init Actions');
            this.initActions();

            this.log('debug', 'Step 4: Init Feedbacks');
            this.initFeedbacks();

            this.log('debug', 'Step 5: Init Variables');
            this.initVariables();

            this.log('debug', 'Step 6: Init Presets');
            this.initPresets();

            if (this.config.host) {
                this.updateStatus(InstanceStatus.Ok);
                this.log('debug', 'Initialization complete (Ok)');
            } else {
                this.updateStatus(InstanceStatus.BadConfig, 'Target Host not configured');
                this.log('debug', 'Initialization complete (BadConfig)');
            }
        } catch (e) {
            this.log('error', `Initialization failed: ${e.message}\n${e.stack}`);
            this.updateStatus(InstanceStatus.Error, e.message);
        }
    }

    async destroy() {
        try {
            if (this.sender) {
                this.sender.stop();
            }
        } catch (e) {
            this.log('error', `Destroy failed: ${e.message}`);
        }
        this.log('debug', 'Module destroyed');
    }

    async configUpdated(config) {
        this.log('debug', 'Config updated, re-initializing...');
        this.config = config || {};
        this.initArtNet();
        this.processConfig();
        this.initActions();
        this.initFeedbacks();
        this.initVariables();
        this.initPresets();
    }

    getConfigFields() {
        const config = this.config || {};
        const fields = [
            {
                type: 'static-text',
                id: 'info',
                width: 12,
                label: 'Usage Info',
                value: `
                    <strong>Dynamic Configuration:</strong><br>
                    1. Set the Counts below.<br>
                    2. Click <strong>Save</strong> to see the individual input fields.<br>
                    3. Define <strong>Templates</strong> (fixture types) first, then assign them to <strong>Fixtures</strong>.<br>
                    4. Global Presets can be defined once and applied to any fixture of that type.
                `
            },
            {
                type: 'number',
                id: 'templateCount',
                label: 'Number of Templates',
                default: 1,
                min: 1,
                max: 10,
                width: 4,
            },
            {
                type: 'number',
                id: 'fixtureCount',
                label: 'Number of Fixtures',
                default: 1,
                min: 1,
                max: 100,
                width: 4,
            },
            {
                type: 'number',
                id: 'presetCount',
                label: 'Number of Global Presets',
                default: 0,
                min: 0,
                max: 100,
                width: 4,
            },
            {
                type: 'textinput',
                id: 'host',
                label: 'Target Host',
                description: 'The IP address of your Art-Net node.',
                width: 8,
                default: '127.0.0.1',
            },
            {
                type: 'number',
                id: 'universe',
                label: 'Universe',
                description: 'The Art-Net universe to send to (0-32767).',
                width: 4,
                min: 0,
                max: 32767,
                default: 0,
            },
            {
                type: 'static-text',
                id: 'template_section_header',
                width: 12,
                label: '',
                value: '<br><h2>1. Define Templates</h2><p>Define your fixture types here. Example: A "Generic RGB" template might have channels <code>1:Red:8, 2:Green:8, 3:Blue:8</code>.</p>'
            },
        ];

        // Template Fields
        const templateCount = config.templateCount || 1;
        for (let i = 1; i <= templateCount; i++) {
            fields.push(
                {
                    type: 'static-text',
                    id: `template_${i}_header`,
                    width: 12,
                    label: '',
                    value: `<hr><strong>Template ${i}</strong>`
                },
                {
                    type: 'textinput',
                    id: `template_${i}_name`,
                    label: 'Template Name',
                    width: 6,
                    default: `Type ${i}`,
                },
                {
                    type: 'textinput',
                    id: `template_${i}_channels`,
                    label: 'Channels (offset:attribute:bits, ...)',
                    description: 'Example: 1:Dimmer:8, 2:Pan:16, 4:Tilt:16',
                    width: 6,
                    default: '1:Dimmer:8',
                }
            );
        }

        // Fixture Fields
        const fixtureCount = config.fixtureCount || 1;
        const templateChoices = [];
        for (let i = 1; i <= templateCount; i++) {
            const name = config[`template_${i}_name`] || `Type ${i}`;
            templateChoices.push({ id: name, label: name });
        }

        fields.push({
            type: 'static-text',
            id: 'fixture_section_header',
            width: 12,
            label: '',
            value: '<br><h2>2. Assign Fixtures</h2><p>Create instances of your templates at specific DMX addresses.</p>'
        });

        for (let i = 1; i <= fixtureCount; i++) {
            fields.push(
                {
                    type: 'static-text',
                    id: `fixture_${i}_header`,
                    width: 12,
                    label: '',
                    value: `<hr><strong>Fixture ${i}</strong>`
                },
                {
                    type: 'textinput',
                    id: `fixture_${i}_name`,
                    label: 'Name',
                    width: 4,
                    default: `Fixture ${i}`,
                },
                {
                    type: 'number',
                    id: `fixture_${i}_address`,
                    label: 'DMX Address',
                    width: 4,
                    min: 1,
                    max: 512,
                    default: 1 + (i - 1) * 10,
                },
                {
                    type: 'dropdown',
                    id: `fixture_${i}_type`,
                    label: 'Fixture Type',
                    width: 4,
                    choices: templateChoices,
                    default: templateChoices[0]?.id || '',
                }
            );
        }

        fields.push({
            type: 'static-text',
            id: 'preset_section_header',
            width: 12,
            label: '',
            value: '<br><h2>3. Global Presets</h2><p>Define common values (like "Color Blue" or "Strobe Fast") that can be applied to any fixture of a specific type. These will also appear as drag-and-drop buttons in the Presets tab.</p>'
        });

        // Global Preset Fields
        const presetCount = config.presetCount || 0;
        for (let i = 1; i <= presetCount; i++) {
            fields.push(
                {
                    type: 'static-text',
                    id: `preset_${i}_header`,
                    width: 12,
                    label: '',
                    value: `<hr><strong>Global Preset ${i}</strong>`
                },
                {
                    type: 'textinput',
                    id: `preset_${i}_name`,
                    label: 'Preset Name',
                    width: 3,
                    default: `Preset ${i}`,
                },
                {
                    type: 'dropdown',
                    id: `preset_${i}_type`,
                    label: 'Applicable to Type',
                    width: 3,
                    choices: templateChoices,
                    default: templateChoices[0]?.id || '',
                },
                {
                    type: 'textinput',
                    id: `preset_${i}_attribute`,
                    label: 'Attribute',
                    width: 3,
                    default: 'Dimmer',
                },
                {
                    type: 'number',
                    id: `preset_${i}_value`,
                    label: 'Value',
                    width: 3,
                    min: 0,
                    max: 65535,
                    default: 255,
                }
            );
        }

        return fields;
    }

    processConfig() {
        const config = this.config || {};
        this.templates = {};
        this.fixtures = [];
        this.presets = [];

        // Parse Templates
        const templateCount = config.templateCount || 1;
        for (let i = 1; i <= templateCount; i++) {
            const name = config[`template_${i}_name`]?.trim();
            const channelsStr = config[`template_${i}_channels`];
            if (name && channelsStr) {
                const channels = [];
                const channelParts = channelsStr.split(',').map(p => p.trim());
                for (const cp of channelParts) {
                    const parts = cp.split(':').map(p => p.trim());
                    if (parts.length >= 2) {
                        channels.push({
                            offset: parseInt(parts[0]),
                            attribute: parts[1],
                            bits: parseInt(parts[2]) || 8
                        });
                    }
                }
                this.templates[name] = channels;
            }
        }

        // Parse Fixtures
        const fixtureCount = config.fixtureCount || 1;
        for (let i = 1; i <= fixtureCount; i++) {
            const name = config[`fixture_${i}_name`]?.trim();
            const address = parseInt(config[`fixture_${i}_address`]);
            const type = config[`fixture_${i}_type`];
            if (name && !isNaN(address) && type) {
                this.fixtures.push({
                    index: i,
                    address: address,
                    name: name,
                    type: type,
                    values: {}
                });
            }
        }

        // Parse Global Presets
        const presetCount = config.presetCount || 0;
        for (let i = 1; i <= presetCount; i++) {
            const name = config[`preset_${i}_name`]?.trim();
            const type = config[`preset_${i}_type`];
            const attribute = config[`preset_${i}_attribute`]?.trim();
            const value = parseInt(config[`preset_${i}_value`]);
            if (name && type && attribute && !isNaN(value)) {
                this.presets.push({
                    name: name,
                    type: type,
                    attribute: attribute,
                    value: value
                });
            }
        }

        this.log('debug', `Parsed ${Object.keys(this.templates).length} templates, ${this.fixtures.length} fixtures, ${this.presets.length} presets.`);
    }

    initActions() {
        try {
            const actions = {};

            const fixtureChoices = this.fixtures.length > 0
                ? this.fixtures.map((f) => ({ id: f.index, label: f.name }))
                : [{ id: 0, label: 'No fixtures defined' }];
            const defaultFixture = fixtureChoices[0].id;

            const attributeChoices = [];
            const processedAttributes = new Set();
            for (const type in this.templates) {
                for (const channel of this.templates[type]) {
                    const id = `${channel.attribute}:${channel.bits}`;
                    const label = `${channel.attribute} (${channel.bits}-bit)`;
                    if (!processedAttributes.has(id)) {
                        attributeChoices.push({ id: id, label: label });
                        processedAttributes.add(id);
                    }
                }
            }
            if (attributeChoices.length === 0) {
                attributeChoices.push({ id: '', label: 'No attributes defined' });
            }
            const defaultAttribute = attributeChoices[0].id;

            actions['set_attribute'] = {
                name: 'Set Attribute Value',
                options: [
                    {
                        type: 'dropdown',
                        id: 'fixture',
                        label: 'Fixture',
                        default: defaultFixture,
                        choices: fixtureChoices,
                    },
                    {
                        type: 'dropdown',
                        id: 'attribute',
                        label: 'Attribute',
                        default: defaultAttribute,
                        choices: attributeChoices,
                    },
                    {
                        type: 'number',
                        id: 'value8',
                        label: 'Value (0-255)',
                        default: 0,
                        min: 0,
                        max: 255,
                        range: true,
                        isVisible: (options) => options.attribute?.endsWith(':8'),
                    },
                    {
                        type: 'number',
                        id: 'value16',
                        label: 'Value (0-65535)',
                        default: 0,
                        min: 0,
                        max: 65535,
                        range: true,
                        isVisible: (options) => options.attribute?.endsWith(':16'),
                    },
                ],
                callback: (action) => {
                    const [attribute, bits] = (action.options.attribute || '').split(':');
                    const val = bits === '16' ? action.options.value16 : action.options.value8;
                    this.setAttributeValue(action.options.fixture, attribute, val);
                },
            };

            actions['set_preset'] = {
                name: 'Set Global Preset',
                options: [
                    {
                        type: 'dropdown',
                        id: 'fixture',
                        label: 'Fixture',
                        default: defaultFixture,
                        choices: fixtureChoices,
                    },
                    {
                        type: 'dropdown',
                        id: 'preset',
                        label: 'Preset',
                        default: this.presets[0]?.name || '',
                        choices: this.presets.length > 0
                            ? this.presets.map((p) => ({ id: p.name, label: `${p.type}: ${p.name}` }))
                            : [{ id: '', label: 'No presets defined' }],
                    },
                ],
                callback: (action) => {
                    const preset = this.presets.find(p => p.name === action.options.preset);
                    if (preset) {
                        this.setAttributeValue(action.options.fixture, preset.attribute, preset.value);
                    }
                },
            };

            actions['step_attribute'] = {
                name: 'Step Attribute Value',
                options: [
                    {
                        type: 'dropdown',
                        id: 'fixture',
                        label: 'Fixture',
                        default: defaultFixture,
                        choices: fixtureChoices,
                    },
                    {
                        type: 'dropdown',
                        id: 'attribute',
                        label: 'Attribute',
                        default: defaultAttribute,
                        choices: attributeChoices,
                    },
                    {
                        type: 'number',
                        id: 'step8',
                        label: 'Step Amount (0-255)',
                        default: 0,
                        min: -255,
                        max: 255,
                        isVisible: (options) => options.attribute?.endsWith(':8'),
                    },
                    {
                        type: 'number',
                        id: 'step16_coarse',
                        label: 'Coarse Step (changes MSB)',
                        default: 0,
                        min: -65535,
                        max: 65535,
                        isVisible: (options) => options.attribute?.endsWith(':16'),
                    },
                    {
                        type: 'number',
                        id: 'step16_fine',
                        label: 'Fine Step (changes LSB)',
                        default: 0,
                        min: -65535,
                        max: 65535,
                        isVisible: (options) => options.attribute?.endsWith(':16'),
                    },
                ],
                callback: (action) => {
                    const [attribute, bits] = (action.options.attribute || '').split(':');
                    const fixture = this.fixtures.find((f) => f.index === action.options.fixture);
                    if (!fixture) return;

                    const current = fixture.values[attribute] || 0;
                    const max = bits === '16' ? 65535 : 255;

                    let step = 0;
                    if (bits === '16') {
                        // In 16-bit mode, we combine both coarse and fine if they are used, 
                        // though typically a user would only assign one per button.
                        step = (action.options.step16_coarse || 0) + (action.options.step16_fine || 0);
                    } else {
                        step = action.options.step8 || 0;
                    }

                    let newVal = current + step;
                    if (newVal < 0) newVal = 0;
                    if (newVal > max) newVal = max;
                    this.setAttributeValue(action.options.fixture, attribute, newVal);
                },
            };

            actions['set_raw_channel'] = {
                name: 'Set Raw Channel Offset',
                options: [
                    {
                        type: 'dropdown',
                        id: 'fixture',
                        label: 'Fixture',
                        default: defaultFixture,
                        choices: fixtureChoices,
                    },
                    {
                        type: 'number',
                        id: 'offset',
                        label: 'Channel Offset (1-based)',
                        default: 1,
                        min: 1,
                        max: 512,
                    },
                    {
                        type: 'number',
                        id: 'value',
                        label: 'Value (0-255)',
                        default: 0,
                        min: 0,
                        max: 255,
                    },
                ],
                callback: (action) => {
                    const fixture = this.fixtures.find((f) => f.index === action.options.fixture);
                    if (!fixture) return;
                    const startAddr = (fixture.address - 1) + (action.options.offset - 1);
                    if (startAddr >= 0 && startAddr <= 511) {
                        if (this.sender) {
                            this.sender.values[startAddr] = action.options.value % 256;
                            this.sendDMX();
                        }
                    }
                },
            };

            actions['flash_attribute'] = {
                name: 'Flash Attribute Value',
                options: [
                    {
                        type: 'dropdown',
                        id: 'fixture',
                        label: 'Fixture',
                        default: defaultFixture,
                        choices: fixtureChoices,
                    },
                    {
                        type: 'dropdown',
                        id: 'attribute',
                        label: 'Attribute',
                        default: defaultAttribute,
                        choices: attributeChoices,
                    },
                    {
                        type: 'number',
                        id: 'value8',
                        label: 'Flash Value (0-255)',
                        default: 255,
                        min: 0,
                        max: 255,
                        isVisible: (options) => options.attribute?.endsWith(':8'),
                    },
                    {
                        type: 'number',
                        id: 'value16',
                        label: 'Flash Value (0-65535)',
                        default: 65535,
                        min: 0,
                        max: 65535,
                        isVisible: (options) => options.attribute?.endsWith(':16'),
                    },
                ],
                callback: (action) => {
                    const [attribute, bits] = (action.options.attribute || '').split(':');
                    const val = bits === '16' ? action.options.value16 : action.options.value8;
                    const fixture = this.fixtures.find((f) => f.index === action.options.fixture);
                    if (!fixture) return;

                    // Store current value for release
                    this.flashStorage = this.flashStorage || {};
                    const key = `${action.options.fixture}_${attribute}`;
                    this.flashStorage[key] = fixture.values[attribute] || 0;

                    this.setAttributeValue(action.options.fixture, attribute, val);
                },
                subscribe: (action) => {
                    // Release callback
                    return () => {
                        const [attribute] = (action.options.attribute || '').split(':');
                        this.flashStorage = this.flashStorage || {};
                        const key = `${action.options.fixture}_${attribute}`;
                        if (this.flashStorage[key] !== undefined) {
                            this.setAttributeValue(action.options.fixture, attribute, this.flashStorage[key]);
                            delete this.flashStorage[key];
                        }
                    };
                }
            };

            actions['toggle_attribute'] = {
                name: 'Toggle Attribute Value',
                options: [
                    {
                        type: 'dropdown',
                        id: 'fixture',
                        label: 'Fixture',
                        default: defaultFixture,
                        choices: fixtureChoices,
                    },
                    {
                        type: 'dropdown',
                        id: 'attribute',
                        label: 'Attribute',
                        default: defaultAttribute,
                        choices: attributeChoices,
                    },
                    {
                        type: 'number',
                        id: 'val1_8',
                        label: 'Value 1 (0-255)',
                        default: 255,
                        min: 0,
                        max: 255,
                        isVisible: (options) => options.attribute?.endsWith(':8'),
                    },
                    {
                        type: 'number',
                        id: 'val2_8',
                        label: 'Value 2 (0-255)',
                        default: 0,
                        min: 0,
                        max: 255,
                        isVisible: (options) => options.attribute?.endsWith(':8'),
                    },
                    {
                        type: 'number',
                        id: 'val1_16',
                        label: 'Value 1 (0-65535)',
                        default: 65535,
                        min: 0,
                        max: 65535,
                        isVisible: (options) => options.attribute?.endsWith(':16'),
                    },
                    {
                        type: 'number',
                        id: 'val2_16',
                        label: 'Value 2 (0-65535)',
                        default: 0,
                        min: 0,
                        max: 65535,
                        isVisible: (options) => options.attribute?.endsWith(':16'),
                    },
                ],
                callback: (action) => {
                    const [attribute, bits] = (action.options.attribute || '').split(':');
                    const fixture = this.fixtures.find((f) => f.index === action.options.fixture);
                    if (!fixture) return;

                    const val1 = bits === '16' ? action.options.val1_16 : action.options.val1_8;
                    const val2 = bits === '16' ? action.options.val2_16 : action.options.val2_8;

                    const current = fixture.values[attribute] || 0;
                    const next = (current === val1) ? val2 : val1;
                    this.setAttributeValue(action.options.fixture, attribute, next);
                }
            };

            actions['blackout_all'] = {
                name: 'Blackout All',
                options: [],
                callback: () => {
                    for (const fixture of this.fixtures) {
                        const template = this.templates[fixture.type];
                        if (!template) continue;
                        for (const channel of template) {
                            fixture.values[channel.attribute] = 0;
                        }
                    }
                    this.updateDmxBuffer();
                    this.sendDMX();
                    this.checkFeedbacks();
                    this.updateVariables();
                }
            };

            this.setActionDefinitions(actions);
        } catch (e) {
            this.log('error', `InitActions failed: ${e.message}`);
        }
    }

    setAttributeValue(fixtureIndex, attribute, value) {
        const fixture = this.fixtures.find((f) => f.index === fixtureIndex);
        if (!fixture) return;

        fixture.values[attribute] = value;

        this.updateDmxBuffer();
        this.sendDMX();
        this.checkFeedbacks();
        this.updateVariables();
    }

    initFeedbacks() {
        try {
            const feedbacks = {};

            const fixtureChoices = this.fixtures.length > 0
                ? this.fixtures.map((f) => ({ id: f.index, label: f.name }))
                : [{ id: 0, label: 'No fixtures defined' }];
            const defaultFixture = fixtureChoices[0].id;

            const attributeChoices = [];
            const processedAttributes = new Set();
            for (const type in this.templates) {
                for (const channel of this.templates[type]) {
                    const id = `${channel.attribute}:${channel.bits}`;
                    const label = `${channel.attribute} (${channel.bits}-bit)`;
                    if (!processedAttributes.has(id)) {
                        attributeChoices.push({ id: id, label: label });
                        processedAttributes.add(id);
                    }
                }
            }
            if (attributeChoices.length === 0) {
                attributeChoices.push({ id: '', label: 'No attributes defined' });
            }
            const defaultAttribute = attributeChoices[0].id;

            feedbacks['active_preset'] = {
                type: 'boolean',
                name: 'Active Preset',
                description: 'Change button style if a global preset is active',
                defaultStyle: {
                    bgcolor: 7619328, // Green
                },
                options: [
                    {
                        type: 'dropdown',
                        id: 'fixture',
                        label: 'Fixture',
                        default: defaultFixture,
                        choices: fixtureChoices,
                    },
                    {
                        type: 'dropdown',
                        id: 'preset',
                        label: 'Global Preset',
                        default: this.presets[0]?.name || '',
                        choices: this.presets.length > 0
                            ? this.presets.map((p) => ({ id: p.name, label: `${p.type}: ${p.name}` }))
                            : [{ id: '', label: 'No presets defined' }],
                    },
                ],
                callback: (feedback) => {
                    const fixture = this.fixtures.find((f) => f.index === feedback.options.fixture);
                    if (!fixture) return false;

                    const preset = this.presets.find(p => p.name === feedback.options.preset);
                    if (!preset) return false;

                    const val = fixture.values[preset.attribute] || 0;
                    return val === preset.value;
                },
            };

            feedbacks['attribute_compare'] = {
                type: 'boolean',
                name: 'Attribute Comparison',
                description: 'Change style based on attribute comparison (e.g., > 50%)',
                defaultStyle: {
                    bgcolor: 7619328, // Green
                },
                options: [
                    {
                        type: 'dropdown',
                        id: 'fixture',
                        label: 'Fixture',
                        default: defaultFixture,
                        choices: fixtureChoices,
                    },
                    {
                        type: 'dropdown',
                        id: 'attribute',
                        label: 'Attribute',
                        default: defaultAttribute,
                        choices: attributeChoices,
                    },
                    {
                        type: 'dropdown',
                        id: 'op',
                        label: 'Operation',
                        default: '>',
                        choices: [
                            { id: '=', label: '=' },
                            { id: '!=', label: '!=' },
                            { id: '>', label: '>' },
                            { id: '<', label: '<' },
                            { id: '>=', label: '>=' },
                            { id: '<=', label: '<=' },
                        ]
                    },
                    {
                        type: 'number',
                        id: 'value',
                        label: 'Value',
                        default: 128,
                        min: 0,
                        max: 65535,
                    },
                ],
                callback: (feedback) => {
                    const fixture = this.fixtures.find((f) => f.index === feedback.options.fixture);
                    if (!fixture) return false;
                    const [attribute] = (feedback.options.attribute || '').split(':');
                    const val = fixture.values[attribute] || 0;
                    const target = feedback.options.value;

                    switch (feedback.options.op) {
                        case '=': return val === target;
                        case '!=': return val !== target;
                        case '>': return val > target;
                        case '<': return val < target;
                        case '>=': return val >= target;
                        case '<=': return val <= target;
                    }
                    return false;
                }
            };

            this.setFeedbackDefinitions(feedbacks);
        } catch (e) {
            this.log('error', `InitFeedbacks failed: ${e.message}`);
        }
    }

    initVariables() {
        try {
            const variables = [];
            for (const fixture of this.fixtures) {
                variables.push({ variableId: `fixture_${fixture.index}_name`, name: `Fixture ${fixture.index} Name` });

                const template = this.templates[fixture.type];
                if (template) {
                    for (const channel of template) {
                        variables.push({
                            variableId: `fixture_${fixture.index}_${channel.attribute.toLowerCase().replace(/ /g, '_')}`,
                            name: `Fixture ${fixture.index} ${channel.attribute}`,
                        });
                    }
                }
            }

            variables.push({ variableId: 'fixture_count_total', name: 'Total Fixtures' });
            variables.push({ variableId: 'dmx_channels_used', name: 'DMX Channels Used' });

            this.setVariableDefinitions(variables);
            this.updateVariables();
        } catch (e) {
            this.log('error', `InitVariables failed: ${e.message}`);
        }
    }

    updateVariables() {
        try {
            const values = {};
            for (const fixture of this.fixtures) {
                values[`fixture_${fixture.index}_name`] = fixture.name;
                const template = this.templates[fixture.type];
                if (template) {
                    for (const channel of template) {
                        values[`fixture_${fixture.index}_${channel.attribute.toLowerCase().replace(/ /g, '_')}`] =
                            fixture.values[channel.attribute] || 0;
                    }
                }
            }

            values['fixture_count_total'] = this.fixtures.length;

            let maxChannel = 0;
            for (const fixture of this.fixtures) {
                const template = this.templates[fixture.type];
                if (template) {
                    for (const channel of template) {
                        const end = (fixture.address - 1) + (channel.offset - 1) + (channel.bits === 16 ? 1 : 0);
                        if (end > maxChannel) maxChannel = end;
                    }
                }
            }
            values['dmx_channels_used'] = maxChannel + 1;

            this.setVariableValues(values);
        } catch (e) {
            this.log('error', `UpdateVariables failed: ${e.message}`);
        }
    }

    initArtNet() {
        try {
            if (this.sender) {
                this.sender.stop();
                this.sender = null;
            }

            if (!this.dmxnet) {
                // Find dmxnet constructor
                const DmxNetConstructor = dmxnet || dmxnet_pkg.dmxnet || dmxnet_pkg.default?.dmxnet;
                if (!DmxNetConstructor) {
                    throw new Error('dmxnet constructor not found in package');
                }

                // Use port 0 to let OS pick a random port and avoid EADDRINUSE on Windows
                this.dmxnet = new DmxNetConstructor({ listen: 0 });
                this.log('debug', 'dmxnet instance created (listening on random port)');
            }

            const config = this.config || {};
            if (config.host) {
                const universe = parseInt(config.universe) || 0;
                const net = (universe >> 8) & 0x7f;
                const subnet = (universe >> 4) & 0x0f;
                const uni = universe & 0x0f;

                this.sender = this.dmxnet.newSender({
                    ip: config.host,
                    net: net,
                    subnet: subnet,
                    universe: uni,
                    base_refresh_interval: 1000,
                });
                this.log('info', `Art-Net sender initialized for ${config.host} (Univ: ${universe} -> Net:${net}, Sub:${subnet}, Uni:${uni})`);
            }
        } catch (e) {
            this.log('error', `Art-Net initialization failed: ${e.message}`);
        }
    }

    sendDMX() {
        try {
            if (this.sender) {
                this.sender.transmit();
            }
        } catch (e) {
            this.log('error', `SendDMX failed: ${e.message}`);
        }
    }

    updateDmxBuffer() {
        try {
            if (!this.sender) return;

            // Reset all 512 channels in the sender's internal values array
            for (let i = 0; i < 512; i++) {
                this.sender.values[i] = 0;
            }

            for (const fixture of this.fixtures) {
                const template = this.templates[fixture.type];
                if (!template) continue;

                for (const channel of template) {
                    const val = fixture.values[channel.attribute] || 0;
                    const startAddr = (fixture.address - 1) + (channel.offset - 1);

                    if (channel.bits === 16) {
                        if (startAddr >= 0 && startAddr <= 510) {
                            this.sender.values[startAddr] = (val >> 8) & 0xff;
                            this.sender.values[startAddr + 1] = val & 0xff;
                        }
                    } else {
                        if (startAddr >= 0 && startAddr <= 511) {
                            this.sender.values[startAddr] = val & 0xff;
                        }
                    }
                }
            }
        } catch (e) {
            this.log('error', `UpdateDmxBuffer failed: ${e.message}`);
        }
    }

    initPresets() {
        try {
            const presets = {};

            for (const preset of this.presets) {
                // Generate a preset for EACH fixture of the applicable type
                for (const fixture of this.fixtures) {
                    if (fixture.type === preset.type) {
                        const id = `fixture_${fixture.index}_preset_${preset.name.toLowerCase().replace(/ /g, '_')}`;
                        presets[id] = {
                            type: 'button',
                            category: `${fixture.name} Presets`,
                            name: `${preset.name}`,
                            style: {
                                text: `${fixture.name}\n${preset.name}`,
                                size: '14',
                                color: 16777215,
                                bgcolor: 0,
                            },
                            steps: [
                                {
                                    down: [
                                        {
                                            actionId: 'set_attribute',
                                            options: {
                                                fixture: fixture.index,
                                                attribute: preset.attribute,
                                                value: preset.value,
                                            },
                                        },
                                    ],
                                    up: [],
                                },
                            ],
                            feedbacks: [
                                {
                                    feedbackId: 'active_preset',
                                    options: {
                                        fixture: fixture.index,
                                        preset: preset.name,
                                    },
                                    style: {
                                        bgcolor: 7619328, // Green
                                    },
                                },
                            ],
                        };
                    }
                }
            }

            this.setPresetDefinitions(presets);
        } catch (e) {
            this.log('error', `InitPresets failed: ${e.message}`);
        }
    }
}

runEntrypoint(ArtNetFixtureInstance, []);