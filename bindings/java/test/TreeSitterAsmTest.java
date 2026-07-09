import io.github.treesitter.jtreesitter.Language;
import io.github.treesitter.jtreesitter.asm.TreeSitterAsm;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

public class TreeSitterAsmTest {
    @Test
    public void testCanLoadLanguage() {
        assertDoesNotThrow(() -> new Language(TreeSitterAsm.language()));
    }
}
