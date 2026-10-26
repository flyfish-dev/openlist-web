import { HStack, Center, Icon, Kbd, CenterProps } from "@hope-ui/solid"
import { changeColor } from "seemly"
import { Show, createMemo } from "solid-js"
import { getMainColor, getSetting, local, objStore, State } from "~/store"
import { BsSearch } from "solid-icons/bs"
import { Container } from "../Container"
import { bus } from "~/utils"
import { Layout } from "./layout"
import { isMac } from "~/utils/compatibility"
import { BrandMark, FormatMatrix } from "~/flyfish/Brand"

export const Header = () => {
  const stickyProps = createMemo<CenterProps>(() => {
    switch (local["position_of_header_navbar"]) {
      case "sticky":
        return { position: "sticky", zIndex: "$sticky", top: 0 }
      default:
        return { position: undefined, zIndex: undefined, top: undefined }
    }
  })

  return (
    <Center
      {...stickyProps}
      bgColor="$background"
      class="header"
      w="$full"
      // shadow="$md"
    >
      <Container>
        <HStack
          class="flyfish-header-inner"
          px="calc(2% + 0.5rem)"
          py="$2"
          w="$full"
          justifyContent="space-between"
        >
          <HStack class="header-left" h="44px">
            <BrandMark />
          </HStack>
          <HStack class="header-right" spacing="$2">
            <FormatMatrix />
            <Show when={objStore.state === State.Folder}>
              <Show when={getSetting("search_index") !== "none"}>
                <HStack
                  class="flyfish-search-trigger"
                  role="button"
                  tabIndex={0}
                  aria-label="搜索文件"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      bus.emit("tool", "search")
                    }
                  }}
                  bg="$neutral4"
                  w="$32"
                  p="$1"
                  rounded="$md"
                  justifyContent="space-between"
                  border="2px solid transparent"
                  cursor="pointer"
                  color={getMainColor()}
                  bgColor={changeColor(getMainColor(), { alpha: 0.15 })}
                  _hover={{
                    bgColor: changeColor(getMainColor(), { alpha: 0.2 }),
                  }}
                  onClick={() => {
                    bus.emit("tool", "search")
                  }}
                >
                  <Icon as={BsSearch} />
                  <HStack>
                    {isMac ? <Kbd>Cmd</Kbd> : <Kbd>Ctrl</Kbd>}
                    <Kbd>K</Kbd>
                  </HStack>
                </HStack>
              </Show>
              <Layout />
            </Show>
          </HStack>
        </HStack>
      </Container>
    </Center>
  )
}
