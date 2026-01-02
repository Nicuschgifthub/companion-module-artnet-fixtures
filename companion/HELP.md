# Art-Net Fixture Controller Help

This module allows you to control multiple Art-Net fixtures with custom channel mappings and presets.

## Configuration
- **Target Host**: The IP address of your Art-Net node.
- **Universe**: The Art-Net universe (0-32767).
- **Fixtures**: Define fixtures using `index:address:name`.
- **Channel Definitions**: Define channels using `offset:attribute:bits(8 or 16)`.
- **Preset Mappings**: Define value ranges for attributes using `attribute:start-end:name`.

## Actions
- **Set Attribute**: Set a value for a specific attribute of a fixture.
- **Set Preset**: Select a named preset for an attribute.
- **Step Attribute**: Increment or decrement an attribute value.
- **Set Raw Channel Offset**: Set a raw DMX value for a specific channel relative to a fixture.