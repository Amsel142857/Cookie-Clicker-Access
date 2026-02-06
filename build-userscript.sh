#!/bin/bash

# Build script to generate bundled userscript from modular source files
# This eliminates external dependencies and fixes Tampermonkey loading issues

set -e

echo "Building Cookie Clicker Accessibility userscript..."

# Output file
OUTPUT="cookie-clicker-accessibility.user.js"

# Start with header
cat userscript-header.txt > "$OUTPUT"

# Add newline after header
echo "" >> "$OUTPUT"

# Start IIFE wrapper
echo "(function() {" >> "$OUTPUT"
echo "    'use strict';" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add modules in order
echo "    // === Garden Module ===" >> "$OUTPUT"
cat modules/garden.js >> "$OUTPUT"
echo "" >> "$OUTPUT"

echo "    // === Pantheon Module ===" >> "$OUTPUT"
cat modules/pantheon.js >> "$OUTPUT"
echo "" >> "$OUTPUT"

echo "    // === Statistics Module ===" >> "$OUTPUT"
cat modules/statistics.js >> "$OUTPUT"
echo "" >> "$OUTPUT"

echo "    // === Main Mod (wrapped for delayed registration) ===" >> "$OUTPUT"
cat >> "$OUTPUT" << 'EOF'
    // Wrap the mod registration to ensure Game is ready
    function registerAccessibilityMod() {
        if (typeof Game === 'undefined' || !Game.ready) {
            console.log('Waiting for Cookie Clicker to be ready...');
            setTimeout(registerAccessibilityMod, 100);
            return;
        }

        console.log('Registering accessibility mod...');

EOF

# Add the main.js content (the Game.registerMod call)
cat main.js >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Close the wrapper function and call it
cat >> "$OUTPUT" << 'EOF'
        console.log('Cookie Clicker Accessibility Mod loaded and registered!');
    }

    // Start the registration process
    registerAccessibilityMod();
EOF

# Close IIFE
echo "})();" >> "$OUTPUT"

echo "✓ Built $OUTPUT successfully!"
echo ""

# Show file size
if command -v wc &> /dev/null; then
    LINES=$(wc -l < "$OUTPUT")
    echo "  Lines: $LINES"
fi

if command -v du &> /dev/null; then
    SIZE=$(du -h "$OUTPUT" | cut -f1)
    echo "  Size: $SIZE"
fi

echo ""
echo "To install:"
echo "  1. Open Tampermonkey dashboard"
echo "  2. Click 'Utilities' tab"
echo "  3. Import from file: $OUTPUT"
echo "  4. Or copy contents and create new script"
