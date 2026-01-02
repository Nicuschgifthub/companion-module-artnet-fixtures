# Art-Net Fixture Controller for Bitfocus Companion

A powerful and flexible Bitfocus Companion module designed to control multiple Art-Net fixtures using a dynamic, template-based approach. Instead of rigid fixture profiles, you define your own **Templates** (Fixture Types) and assign them to **Fixtures** at specific DMX addresses.

## Key Features

- **Dynamic Templates**: Define any fixture type by mapping DMX offsets to attributes (e.g., Dimmer, Pan, Tilt, RGB).
- **Multi-Fixture Control**: Patch as many fixtures as you need across a single Art-Net universe.
- **16-bit Support**: Native support for 16-bit attributes (uses two DMX channels for fine control).
- **Global Presets**: Define common values (like "Red", "Full", or "Strobe Slow") once per template and apply them to any matching fixture.
- **Automatic variables**: Every fixture attribute is automatically available as a Companion variable.
- **Visual Feedbacks**: Feedbacks for attribute values or active presets.

---

## Installation

1. Download the latest `bitfocus-artnet-fixtures-1.0.7.tgz` from the repository.
2. Open **Bitfocus Companion**.
3. Go to the **Modules** tab.
4. Click **Import Module Package**.
5. Select the `bitfocus-artnet-fixtures-@latest.tgz` file.
6. Add `Generic: Art-Net Fixtures` in the **Connections** tab.

---

## Configuration

### 1. Global Settings
- **Target Host**: The IP address of your Art-Net node (e.g., `192.168.1.200`).
- **Universe**: The Art-Net universe (0-32767).

### 2. Define Templates (Fixture Types)
A template defines the "personality" of a fixture.
- **Template Name**: e.g., `Generic RGB` or `Moving Head`.
- **Channels**: Defined as `offset:attribute:bits`.
  - *Example*: `1:Dimmer:8, 2:Red:8, 3:Green:8, 4:Blue:8`
  - *Example (with 16-bit attribute)*: `1:Dimmer:8, 2:Pan:16, 4:Tilt:16`

### 3. Assign Fixtures
Assign your templates to specific DMX addresses.
- **Name**: A friendly name for the fixture (e.g., `Wash Left`).
- **DMX Address**: The starting address of the fixture (1-512).
- **Fixture Type**: Select one of the templates you defined.

### 4. Global Presets (Optional)
Create named shortcuts for specific values.
- **Preset Name**: e.g., `Full White`.
- **Applicable Type**: The template this preset belongs to.
- **Attribute**: The specific attribute to set (e.g., `Dimmer`).
- **Value**: The DMX value (0-255 for 8-bit, 0-65535 for 16-bit).

---

## Actions

- **Set Attribute Value**: Set a specific DMX value for any fixture attribute.
- **Set Global Preset**: Apply a pre-defined value to a fixture.
- **Step Attribute Value**: Increment or decrement a value.
- **Toggle Attribute**: Switch between two values on a single button.
- **Flash Attribute**: Temporarily set a value while the button is held.
- **Blackout All**: Sets all attributes for all fixtures to 0.

---

## Development & Build Workflow

If you are modifying the code or adding features, use the built-in release script:

1. **Edit** the source in `companion/main.js`.
2. **Update Version**: Increment the version in `package.json`.
3. **Build**: Run `npm run release` in your terminal.