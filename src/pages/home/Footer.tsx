import { Anchor, HStack, VStack } from "@hope-ui/solid"
import { Link } from "@solidjs/router"
import { AnchorWithBase } from "~/components"
import { useT } from "~/hooks"
import { me } from "~/store"
import { UserMethods } from "~/types"

export const Footer = () => {
  const t = useT()
  return (
    <VStack class="footer" w="$full" py="$4">
      <HStack spacing="$1">
        <Anchor href="https://github.com/OpenListTeam/OpenList" external>
          {t("home.footer.powered_by")}
        </Anchor>
        <span>|</span>
        <AnchorWithBase
          as={Link}
          href={UserMethods.is_guest(me()) ? "/@login" : "/@manage"}
        >
          {t(UserMethods.is_guest(me()) ? "login.login" : "home.footer.manage")}
        </AnchorWithBase>
      </HStack>
      <HStack class="flyfish-source-link" spacing="$2">
        <Anchor href="https://github.com/flyfish-dev/openlist" external>
          后端源码
        </Anchor>
        <span>·</span>
        <Anchor href="https://github.com/flyfish-dev/openlist-web" external>
          Flyfish 界面与预览集成
        </Anchor>
        <span>·</span>
        <Anchor href="https://github.com/flyfish-dev/file-viewer" external>
          File Viewer
        </Anchor>
      </HStack>
    </VStack>
  )
}
